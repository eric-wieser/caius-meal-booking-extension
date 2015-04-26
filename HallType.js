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
				if(cells.size() > 2) {
					parseFullness(s, cells.eq(2).text());
				}
				else {
					parseStatus(s, cells.eq(1).text());
				}
				s.status = 'booked'
				if(!s.invalid)
					return s;
			}).get(),
			unbookedRows.map(function() {
				var s = new HallSummary(type);
				var cells = $(this).find('td');
				parseDate(s, cells.eq(0).text());
				if(cells.size() > 2) {
					parseFullness(s, cells.eq(1).text());
					parseStatus(s, cells.eq(2).text());
				}
				else {
					parseStatus(s, cells.eq(1).text());
				}
				if(!s.invalid)
					return s;
			}).get()
		)
		return results;
	}).promise();
};
