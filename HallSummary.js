

// Static data
var root = 'https://www.mealbookings.cai.cam.ac.uk/index.php';

var parseMenu = function(type, mHtml) {
	var lines = mHtml
		.replace(/\n/g, ' ')
		.split(/<br(?: ?\/?)>/g)
		.map(function(l) { return l.trim(); });

	if(type.name != 'cafeteria' && lines[1] == '') {
		lines[1] = '*';
	}


	var courses = lines
		.join('\n')
		.split('\n*\n')
		.map(function(c) { return c.trim(); });

	// remove obvious line wrapping
	courses = courses.map(function(s) {
		return s.replace(/\([^)]+\)/, function(l) { return l.replace(/\s+/g, ' ') });
	});

	var vegCourses = courses[courses.length - 1].split(/\nVegetarian\s*(?:\s*)\n/);
	if(vegCourses.length > 1) {
		courses[courses.length - 1] = vegCourses[0];
		var mainLines = courses[2].split('\n\n');
		mainLines[0] = '<span class="main-meat">' + mainLines[0] + '</span>\n'
		             + '<span class="main-vegetarian">' + vegCourses[1].replace(/\s+/g, ' ') + '</span>';
		courses[2] = mainLines.join('\n\n');
	}

	return courses;
}

// HallSummary class
var HallSummary = function(type) {
	this.date = null;
	this.capacity = 0;
	this.available = 0;
	this.status = 'unknown';
	this.type = type;
}
Object.defineProperty(HallSummary.prototype, 'url', {
	get: function() { return root + '?' + $.param({event: this.type.id, date: this.date.toLocalISODateString()}); }
});
HallSummary.prototype.toString = function() {
	return this.date.toLocalISODateString() + ' (' + this.type.name + ') - ' + this.status + ' ' + this.available + '/' + this.capacity;
}
HallSummary.prototype.loadPage = function() {
	if(this._ajaxTask) return this._ajaxTask;

	return this._ajaxTask = $.get(this.url, null, null, 'html').then(function(data) {
		return $(data);
	});
}
HallSummary.prototype.loadBookableness = function() {
	return this.loadPage().then(function($doc) {
		return this.bookable = $doc.find('form').size() > 0;
	}.bind(this));
}
HallSummary.prototype.loadMenu = function() {
	var self = this;
	return this.loadPage().then(function($doc) {
		var error = $doc.find('.error');
		if(error.size())
			return $.Deferred().reject(error);

		var menu = $doc.find('.menu');
		if(menu.size()) {
			menu = parseMenu(self.type, menu.html());
			self.menu = menu;
			return menu;
		}

	}).promise();
};
HallSummary.prototype.loadAttendees = function() {
	var self = this;
	return this.loadPage().then(function($doc) {
		var error = $doc.find('.error');
		if(error.size())
			return $.Deferred().reject(error);
			self.attendees = [];

		var attendees = $doc.find('.list');
		if(attendees.size() == 1 && attendees.find('tr').find('td').size() == 1) {
			self.attendees = [];
		}
		else if(attendees.size()) {
			attendees = attendees.find('tr').map(function() {
				var cells = $(this).find('td');
				var name = cells.eq(0).text();
				var namedGuestStr = /\((\d+) guests?;(.*)\)/.exec(cells.eq(1).text());
				var guestStr = /\((\d+) guests?\)/.exec(cells.eq(1).text());
				if(namedGuestStr)
					return {name: name, guestCount: namedGuestStr[1], guests: namedGuestStr[2]};
				else if(guestStr)
					return {name: name, guestCount: guestStr[1]};
				else
					return {name: name};
			}).get();
			self.attendees = attendees;
		}
		return self.attendees;
	}).promise();
};

/* Possible booking messages:
update:
	<div class="message"><div class="success">Booking updated successfully</div></div>
	<div class="message"><div class="success">Booking created successfully</div></div>
delete_confirm:
	<div class="message"><div class="success">Your booking for .* on .* has been successfully deleted.</div></div>
*/

HallSummary.prototype.makeBooking = function(settings) {
	return $.post(this.url, {
		update: '',
		vegetarians: settings.vegetarian ? 1 : 0,
		requirements: settings.requirements
	}, null, 'html').then(function(data) {
		var message = $(data).find('.message > div');
		var notOpenYet =  $(data).find('h2').filter(function() {
			return $(this).text().trim() == "Bookings for this event have not yet opened";
		}).length != 0;

		var d = $.Deferred();

		if(notOpenYet) {
			return d.reject('Not open');
		}
		else if(message.hasClass('success') && message.text().match(/Booking (?:created|updated) successfully/)) {
			return d.resolve(); // everything is ok
		}
		else if(message.size() == 0) {
			var win = window.open('about:blank');
			with(win.document) {
				open();
				write(data.replace(/<(\/?)ajax:/g, '<$1'));
				close();
			}
			return d.reject('Booking failed silently!');
		}
		else {
			return d.reject('Error!');
			console.log(message.html());
		}
	});
};

HallSummary.prototype.clearBooking = function() {
	return $.post(this.url, {
		delete_confirm: ''
	}, null, 'html').then(function(data) {
		console.log(data);
	});
};

HallSummary.prototype.swapTo = function(typeId) {
	$.post(this.url, {
		transfer: '',
		target: typeId
	}).then(function(data) {
		console.log(data);
	});
};


/*
target:257
transfer:""

delete:
edit:
*/


HallSummary.loadAll = function(opts) {
	return HallType.loadAll()
		.then(function(types) {
			var tasks = types.map(function(t) {
				return t.loadHalls(opts);
			});
			return $.whenAll(tasks);
		})
		.then(function(results) {
			return [].concat.apply([], results);
		})
		.promise();
};
