// Utility functions
(function() {
	Date.extend({
		toISODateString: function() { return this.toISOString().substring(0, 10); },
		toLocalISODateString: function() { return this.toLocalISOString().substring(0, 10); },
		toLocalISOString: function() {
			function pad(n) { return n < 10 ? '0' + n : n }
			var localIsoString = this.getFullYear() + '-'
				+ pad(this.getMonth() + 1) + '-'
				+ pad(this.getDate()) + 'T'
				+ pad(this.getHours()) + ':'
				+ pad(this.getMinutes()) + ':'
				+ pad(this.getSeconds());
			if(this.getTimezoneOffset() == 0) localIsoString += 'Z';
			return localIsoString;
		}
	});

	Array.extend({
		// Behaves like itertools.groupby, maintaining sort order
		eachGroup: function(map, fn) {
			var arr = this, result = [], lastKey;
			var keys = this.map(map);
			this.each(function(el, index) {
				var key = keys[index];
				if(result.length != 0 && !Object.equal(key, lastKey)) {
					fn(lastKey, result);
					result = [];
				}
				lastKey = key;
				result.push(el);
			});
			fn(lastKey, result);
		}
	});

	// jQuery configuration
	$.ajaxPrefilter('html', function(options, originalOptions) {
		if(!originalOptions.dataFilter) {
			// encode root-level tags in a way that they can be interpreted
			options.dataFilter = function(htmlString) {
				return htmlString.replace(/<(\/?)(html|head|body)/g, '<$1ajax:$2')
			};
		}
	});

	jQuery.whenAll = function(dfds) {
		return this.when.apply(this, dfds).then(function() {
			return [].slice.call(arguments);
		}).promise();
	}
})();

// var NormalMenu = function(html) {
// 	menu = html.split('<br>')
// 	self.menu = menu;
// 	menu.push(menu.length+'');
// 	return menu;
// };

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

var HallType = function(name, id) {
	this.name = name;
	this.id = id;
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
	}).promise();
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

HallSummary.prototype.makeBooking = function() {
	return $.post(this.url, {
		update: ''
	}, null, 'html').then(function(data) {
		var message = $(data).find('.message > div');

		if(message.size() == 0)
			return new $.Deferred().reject('Booking failed silently!');
		else if(message.hasClass('success') && message.text().match(/Booking (?:created|updated) successfully/))
			return; // everything is ok
		else
			console.log(data);
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

			var fullnessParts = /\((\d+)\/(\d+)\)/.exec(str)
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
	var tasks = types.map(function(t) {
		return HallSummary.loadAllOfType(t);
	});
	return $.whenAll(tasks).then(function(results) {
		return [].concat.apply([], results);
	}).promise();
};

// Static data
var root = 'https://www.mealbookings.cai.cam.ac.uk/index.php';

var types = [
	new HallType('first', 256),
	new HallType('formal', 257),
	new HallType('cafeteria', 262),
	new HallType('sunday formal', 258)
];

var friendLoader = (function() {
	var d = $.Deferred();
	chrome.storage.sync.get("friends", function(data) {
     	console.log("data", data);
     	d.resolve(data);
    });
    return d.promise();
})();

$.defer = function(f) {
	var d = $.Deferred();
	var args = [].slice.call(arguments, 1);
	args.push(d.resolve);
	f.apply(f, args);
	return d;
}
$.when(
	$.defer(chrome.extension.sendRequest, {action: 'getTemplates'}),
	$.defer($(document).ready)
).then(function domLoaded(templates) {

	// Add sidebar link
	$('.sidebar ul li:last-child').before(
		$('<li>').append(
			$('<a>').attr('href', '/menus').text('Summary')
		)
	);


	if(location.pathname == '/menus') {
		// load the templates required
		$.template("dayTemplate", templates.day.default);
		$.template("toolbarTemplate", templates.toolbar.default);

		$('body').empty().addClass('custompage');
		document.title = "Menus | Caius Hall Bookings";

		// add the toolbar
		var toolbar = $.tmpl("toolbarTemplate");
		toolbar.find('.toggle-past-halls').click(function() {
			$('body').toggleClass('show-past-halls');
		});
		toolbar.appendTo('body');
		var attendeeWrapper = $('<div>').addClass('attendee-wrapper').appendTo('body');

		HallSummary.loadAll().done(function(all) { all
			.sortBy('date')
			.eachGroup('date', function(date, halls) {
				// sort formals and firsts
				halls = halls.sortBy(function(h) { return h.type.id; });

				// populate the template
				var dayElem = $.tmpl("dayTemplate", {date: date, halls: halls});

				// add status classes
				if(date.is('today')) dayElem.attr('id', 'today').addClass('day-current');
				if(date.isBefore('today')) dayElem.addClass('day-past');
				if(date.isAfter('today')) dayElem.addClass('day-future');
				if(halls.some(function(h) { return h.status == 'booked'; }))
					dayElem.addClass('day-booked');

				// emit html
				dayElem.appendTo('body');

				dayElem.find('.hall').each(function(i) {
					var hallElem = $(this);
					var hall = halls[i];
					hall.loadAttendees().done(function() {
						var list = $();
						if(hall.attendees.length) {
							list = $('<div>').hide();
							hall.attendees.each(function(a) {
								$('<span>').text(a.name).appendTo(list);
							});
							list.appendTo(attendeeWrapper);
						}
						hallElem.on('mouseenter', function() {
							attendeeWrapper.children('div').hide();
							list.show().focus();
						});
					})
					hallElem.find('.booking-button-book').on('click', function() {
						hall.makeBooking().then(function() {
							location.reload();
						});
						return false;
					});
					hallElem.find('.booking-button-cancel').on('click', function() {
						hall.clearBooking().then(function() {
							location.reload();
						});
						return false;
					});
				});
				dayElem.find('.date').on('click', function() {
					window.selected = halls;
					return false;
				});

				// load menus
				function makeMenu(m) {
					var elem = $('<div>').addClass('menu');
					m.each(function(course) {
						$('<div>').addClass('menu-course').text(course.trim()).appendTo(elem);
					})
					return elem;
				}

				var menuTasks = halls.map('loadMenu');
				$.whenAll(menuTasks).done(function() {
					var first = halls[0];
					var notUnique = halls.all(function(h) { return Object.equal(h.menu, first.menu); });
					var hasMenu = false;
					if(notUnique) {
						if(first.menu) {
							makeMenu(first.menu).appendTo(dayElem);
							hasMenu = true;
						}
					} else {
						halls.each(function(h) {
							if(h.menu) {
								hasMenu = true;
								makeMenu(h.menu).appendTo(dayElem);
							}
						});
					}
					if(!hasMenu)
						dayElem.addClass('nomenu')
				})
			});
		});
	}
});
