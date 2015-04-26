var root = 'https://www.mealbookings.cai.cam.ac.uk/index.php';

var HallType = function(name, id) {
	this.name = name;
	this.id = id;
}

HallType.loadAll = function() {
	return $.defer(Object.method(chrome.extension, 'sendRequest'), {action: 'loadHallTypes'}).then(function(data) {
		data.forEach(function(d) {
			d.__proto__ = Object.create(HallType.prototype);
		});
		return data;
	})
};


HallType.prototype.loadHalls = function(opts) {
	opts = Object.merge({
		from: new Date('1970-01-01'),
		to:   new Date('2038-01-19')
	}, opts)
	var type = this;
	// request all valid unix timestamps
	return $.get(root, {
		'event': type.id,
		'from': opts.from.toLocalISODateString(),
		'to': opts.to.toLocalISODateString()
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
			var fullnessParts = /\((-?\d+)\/(\d+)\)/.exec(str);
			try {
				summary.capacity = parseInt(fullnessParts[2]);
				summary.available = parseInt(fullnessParts[1]);
			} catch(e) { }
		}

		var parseStatus = function(summary, str) {
			str = str.trim();
			if(/\(signup deadline has passed\)/.test(str))
				summary.status = 'closed';
			else if(/\(signup has not yet opened\)/.test(str))
				summary.status = 'unopened';
		}

		var parseCells = function(s, cells) {
			parseDate(s, cells.eq(0).text());
			var rest = cells.slice(1).text();
			parseFullness(s, rest);
			parseStatus(s, rest);
			if(!s.invalid)
				return s;
		};

		var results = [].concat(
			bookedRows.map(function() {
				var s = new HallSummary(type);
				s.status = 'booked';
				return parseCells(s, $(this).find('td'));
			}).get(),
			unbookedRows.map(function() {
				var s = new HallSummary(type);
				s.status = 'open';
				return parseCells(s, $(this).find('td'));
			}).get()
		)
		return results;
	}).promise();
};
