var profileLoad = $.get('https://www.mealbookings.cai.cam.ac.uk/profile.php').then(function(data) {
	return {
		vegetarian: $(data).find('input[name=vegetarian]').prop('checked'),
		requirements: $(data).find('input[name=requirements]').val(),
	};
});


var pageLoaders = Number.range(0, 350).every().map(function(i) {
	return $.get('https://www.mealbookings.cai.cam.ac.uk/index.php', {event: i}).then(function(d) {
		var header = $(d).find('h1');
		var title = header.text();
		var description = header.nextAll('p').first().text();
		if(/^Current bookings for/.test(title))
			return undefined;
		else if(/^Error:/.test(title))
			return null;
		else
			return {id: i, name: title, description: description}
	})
});

var hallNameLoad = $.whenAll(pageLoaders).then(function(titles) {
	// remove non-existant halls
	return titles.filter(function(x) { return x; });
});

chrome.extension.onRequest.addListener(function(request, sender, sendResponse) {
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