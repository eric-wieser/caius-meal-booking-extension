var loggedIn = $.Deferred();


function pingAnalytics(d) {
	var user = $(d).find('.login_body').first().text();
	var crsid = /\((.+)\)/.exec(user)[1];
	var version = chrome.app.getDetails().version;

	$.getJSON('http://meals.efw27.user.srcf.net:8989/ping', {from: crsid, v: version});
}

var profilePageLoad = loggedIn
	.then(function() {
		return $.get('https://www.mealbookings.cai.cam.ac.uk/profile.php');
	})

var profileLoad = profilePageLoad
	.then(function(data) {
		pingAnalytics(data);
		return {
			vegetarian: $(data).find('input[name=vegetarian]').prop('checked'),
			requirements: $(data).find('input[name=requirements]').val(),
		};
	});

var analyticsLoad = profilePageLoad.then(function(d) {
	var user = $(d).find('.login_body').first().text();
	var crsid = /\((.+)\)/.exec(user)[1];
	var version = chrome.app.getDetails().version;

	return {from: crsid, v: version};
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

		$.get('https://www.mealbookings.cai.cam.ac.uk/').then(function()
		{

			console.log("TEST");
			var bookingIDs = [];
			$(".list a").each (function()
			{
				var thisEventURL = $(this).attr("href");
				if (thisEventURL[1] == "h") return;
				var thisEventID = thisEventURL.substring(7,10);
				bookingIDs.append(parseInt(thisEventID));
			})

			var minID = min(bookingIDs);
			var maxID = max(bookingIDs);

			console.log(minID);
			console.log(maxID);

		})

		var pageLoaders = Number.range(minID, maxID).every().map(function(i) {
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

var lessCompiled = (function() {
	var parser = new(less.Parser)({
		paths: ['.'], // Specify search paths for @import directives
		filename: 'style-wrapper.less' // Specify a filename, for better error messages
	});

	return $.get(chrome.extension.getURL('style.less')).then(function(lessStyle) {
		var d = $.Deferred();
		parser.parse(lessStyle, function (err, tree) {
			if (err) {
				return d.reject(err);
			}
			d.resolve(tree.toCSS());
		});
		return d.promise();
	});
})();

chrome.extension.onRequest.addListener(function(request, sender, sendResponse) {
	loggedIn.resolve();

	analyticsLoad.then(function(payload) {
		$.getJSON('http://efw27.user.srcf.net:8090/ping', payload);
	});

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
	else if(request.action == 'getLess') {
		lessCompiled.then(function(x) {
			sendResponse(x);
		});
	}
});
