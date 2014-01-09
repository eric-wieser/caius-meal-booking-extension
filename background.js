var loggedIn = $.Deferred();

var profileLoad = loggedIn
	.then(function() {
		return $.get('https://www.mealbookings.cai.cam.ac.uk/profile.php');
	})
	.then(function(data) {
		return {
			vegetarian: $(data).find('input[name=vegetarian]').prop('checked'),
			requirements: $(data).find('input[name=requirements]').val(),
		};
	});

var normalizeName = function(name) {
	name = name.trim().toLowerCase();
	name = name.replace(/ +\(?early\)?/, '');
	name = name.replace(/ +hall$/, '');
	name = name.replace(/1st/, 'first');
	name = name.replace(/^pre term/, 'pre-term');
	return name;
}

var hallNameLoad = loggedIn
	.then(function() {
		var pageLoaders = Number.range(256, 300).every().map(function(i) {
			return $.get('https://www.mealbookings.cai.cam.ac.uk/index.php', {event: i}).then(function(d) {
				var header = $(d).find('h1');
				var title = header.text();

				if(/^Current bookings for/.test(title))
					return undefined;
				else if(/^Error:/.test(title))
					return null;

				var description = header.nextAll('p').first().text();
				var dataTable = header.nextAll('.table').first();
				var data = {};
				dataTable.find('tr').each(function() {
					var key = $(this).find('th').text().replace(/:$/,'').toLowerCase();
					var value = $(this).find('td').text();
					data[key] = value;
				});

				return {id: i, name: normalizeName(title), description: description, data: data}
			})
		});
		return $.whenAll(pageLoaders)
	})
	.then(function(titles) {
		// remove non-existant halls
		return titles.filter(function(x) { return x; });
	});

chrome.extension.onRequest.addListener(function(request, sender, sendResponse) {
	loggedIn.resolve();
	if(request.action == 'getTemplates') {
		var templates = document.querySelectorAll('#templates > div');
		var templatePayload = {};

		for (var i = 0; i < templates.length; i++) {
			var name = templates[i].getAttribute('data-name');
			var theme = templates[i].getAttribute('data-theme') || 'default';
			if(templatePayload[name] == null)
				templatePayload[name] = {};

			templatePayload[name][theme] = templates[i].innerHTML;
		}

		sendResponse(templatePayload);
	}
	else if(request.action == 'getPreferences') {
		profileLoad.then(function(x) {
			sendResponse(x);
		});
	}
	else if(request.action == 'loadHallTypes') {
		hallNameLoad.then(function(x) {
			sendResponse(x);
		});
	}
});