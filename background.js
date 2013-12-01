var profileLoad = $.get('https://www.mealbookings.cai.cam.ac.uk/profile.php').then(function(data) {
	return {
		vegetarian: $(data).find('input[name=vegetarian]').prop('checked'),
		requirements: $(data).find('input[name=requirements]').val(),
	};
})

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
});
