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
HallSummary.prototype.toString = function() {
	return this.date.toLocalISODateString() + ' (' + this.type.name + ') - ' + this.status + ' ' + this.available + '/' + this.capacity;
}
HallSummary.prototype.loadPage = function() {
	if(this._ajaxTask) return this._ajaxTask;

	return this._ajaxTask = $.get(root, {
		'event': this.type.id,
		'date': this.date.toLocalISODateString()
	}, null, 'html').then(function(data) {
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
			menu = menu.text().trim().split('*')
			self.menu = menu;
			return menu;
		}

	}).promise();
};

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
}

// Static data
var root = 'https://www.mealbookings.cai.cam.ac.uk/index.php';

var types = [
	new HallType('first', 256),
	new HallType('formal', 257),
	new HallType('cafeteria', 262),
	new HallType('sunday formal', 258)
];

$(function() {
	console.log("Hello World");

	if(location.pathname == '/summary') {
		$('body').empty();

		HallSummary.loadAll().done(function(all) {
			all.sortBy(function(s) { return s.date });
			all.each(function(s) {
				console.log(s);
				$('<p>').text(s.toString()).appendTo('body');
			})
		});
	}

	if(location.pathname == '/menus') {
		$('body').empty().addClass('custompage');

		HallSummary.loadAll().done(function(all) {
			all
				.sortBy(function(s) { return s.date })
				.eachGroup('date', function(date, halls) {
					var parent = $('<div>')
						.addClass('day');
					var hallsElem = $('<div>')
						.addClass('halls');

					$('<div>').addClass('date').text(date.format('{dd} {mon}')).appendTo(parent);

					halls.each(function(h) {
						console.log(h);
						$('<a>')
							.addClass('hall')
							.addClass('hall-status-'+h.status)
							.attr('href', root + '?' + $.param({event: h.type.id, date: date.toLocalISODateString()}))
							.append(
								$('<div>')
									.addClass('hall-capacity-bar')
									.css('width', 100 * h.available/h.capacity + '%'),
								$('<span>')
									.addClass('hall-capacity')
									.text(h.available + ' / ' + h.capacity),
								$('<a>')
									.text(h.type.name + ' - ' + h.status)
							)
							.appendTo(hallsElem);
					});
					hallsElem.appendTo(parent);

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
						if(notUnique) {
							makeMenu(first.menu).appendTo(parent);
						} else {
							halls.each(function(h) { 
								makeMenu(h.menu).appendTo(parent);
							});
						}
					})
					parent.appendTo('body');
				});
		});
	}
});
