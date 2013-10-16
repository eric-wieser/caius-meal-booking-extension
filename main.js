// Utility functions
(function() {
	Array.range = function(n) {
		var a = new Array(n);
		for(var i = 0; i < n; i++) a[i] = i;
		return a;
	};

	Object.defineProperty(Array.prototype, 'sortBy', {
		value: function(f) {
			this.sort(function(a, b) {
				var fa = f(a), fb = f(b);
				if(fa < fb) return -1;
				if(fa > fb) return 1;
				return 0;
			});
		}
	});
	Date.prototype.toISODateString = function() { return this.toISOString().substring(0, 10); };
	Date.prototype.clone = function() { return new Date(this.getTime()); };


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
		var d = $.Deferred();
		this.when.apply(this, dfds).done(function() {
			d.resolve([].slice.call(arguments))
		}).fail(d.reject);
		return d.promise();
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
	return this.date.toISODateString() + ' (' + this.type.name + ') - ' + this.status + ' ' + this.available + '/' + this.capacity;
}
HallSummary.prototype.loadMenu = function() {
	var d = $.Deferred();
	var self = this;
	$.get(root, {
		'event': this.type.id,
		'date': this.date.toISOString().substring(0, 10)
	}, null, 'html').done(function(data) {
		var $doc = $(data);
		var $doc = $(data);

		var error = $doc.find('.error');
		if(error.size())
			return d.reject(error);

		var menu = $doc.find('.menu');
		if(menu.size()) {
			self.menu = menu;
			return d.resolve();
		}
		else
			return d.resolve();

	}).fail(d.reject);

	return d.promise();
};

HallSummary.loadAllOfType = function(type) {
	var d = $.Deferred();
	// request all valid unix timestamps
	$.get(root, {'event': type.id, 'from': '1970-01-01', 'to': '2038-01-19'}, null, 'html')
		.done(function(data) {
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
				summary.date.setHours(0,0,0,0);
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
			d.resolve(results);
		})
		.fail(d.fail);

	return d.promise();
};

HallSummary.loadAll = function() {
	var tasks = types.map(function(t) {
		return HallSummary.loadAllOfType(t);
	});
	var d = $.Deferred();
	$.whenAll(tasks).done(function(results) {
		d.resolve([].concat.apply([], results));
	}).fail(d.reject);
	return d.promise();
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
			all.forEach(function(s) {
				console.log(s);
				$('<p>').text(s.toString()).appendTo('body');
			})
		});
	}

	if(location.pathname == '/menus') {
		$('body').empty();

		HallSummary.loadAll().done(function(all) {
			all.sortBy(function(s) { return s.date });
			all.forEach(function(s) {
				console.log(s);
				var d = $('<div>')
					.addClass('hall')
					.addClass('hall-status-'+s.status)
					.css({overflow: 'hidden'})
					.append(
						$('<div>')
							.addClass('hall-header')
							.append(
								$('<div>')
									.addClass('progress')
									.css('width', 100 * s.available/s.capacity + '%'),
								$('<p>').text(s.toString())
							)
					)
					.appendTo('body');

				s.loadMenu().done(function() {
					if(s.menu) s.menu.appendTo(d);
				})
			})
		});
	}
});
