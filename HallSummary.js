

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
		.split('\n*\n');


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
				var guestStr = /\((.*)\)/.exec(cells.eq(1).text());
				if(guestStr)
					return {name: name, guests: guestStr};
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


HallSummary.loadAllOfType = function(type) {
	// request all valid unix timestamps
	return $.get(root, {
		'event': type.id,
		'from': '1970-01-01',
		'to': '2038-01-19'
	}, null, 'html').then(function(data) {
		var $doc = $(data);

		var tables = $doc.find('table.list');
		var bookedRows = tables.eq(0).find('tr').slice(1, -1);
		var unbookedRows = tables.eq(1).find('tr').slice(1, -1);

		var parseDate = function(summary, str) {
			if(str.trim() == "No current bookings found.") {
				summary.invalid = true;
				return;
			}
			summary.date = new Date(str);
		}

		var parseFullness = function(summary, str) {

			var fullnessParts = /\((-?\d+)\/(\d+)\)/.exec(str)
			try {
				summary.capacity = parseInt(fullnessParts[2]);
				summary.available = parseInt(fullnessParts[1]);
			} catch(e) {};
		}

		var parseStatus = function(summary, str) {
			str = str.trim();
			if(str == '(signup deadline has passed)')
				summary.status = 'closed';
			else if(str == '(signup has not yet opened)')
				summary.status = 'unopened';
			else if(str == '')
				summary.status = 'open';
			else
				summary.status = str;
		}


		var results = [].concat(
			bookedRows.map(function() {
				var cells = $(this).find('td');
				var s = new HallSummary(type);
				parseDate(s, cells.eq(0).text());
				parseFullness(s, cells.eq(2).text());
				s.status = 'booked'
				if(!s.invalid)
					return s;
			}).get(),
			unbookedRows.map(function() {
				var s = new HallSummary(type);
				var cells = $(this).find('td');
				parseDate(s, cells.eq(0).text());
				parseFullness(s, cells.eq(1).text());
				parseStatus(s, cells.eq(2).text());
				if(!s.invalid)
					return s;
			}).get()
		)
		return results;
	}).promise();
};

HallSummary.loadAll = function() {
	return HallType.loadAll()
		.then(function(types) {
			var tasks = types.map(function(t) {
				return HallSummary.loadAllOfType(t);
			});
			return $.whenAll(tasks);
		})
		.then(function(results) {
			return [].concat.apply([], results);
		})
		.promise();
};
