var loggedIn = $.Deferred();


var profilePageLoad = loggedIn
	.then(function() {
		return $.get('https://www.mealbookings.cai.cam.ac.uk/profile.php');
	})

var profileLoad = profilePageLoad
	.then(function(data) {
		return {
			vegetarian: $(data).find('input[name=vegetarian]').prop('checked'),
			requirements: $(data).find('input[name=requirements]').val(),
		};
	});

var analyticsLoad = profilePageLoad.then(function(d) {
	var user = $(d).find('.login_footer').first().text();
	var crsid = /\((.+)\)/.exec(user)[1];
	var version = chrome.app.getDetails().version;

	return {from: crsid, v: version};
});

var normalizeName = function(name) {
	name = name.trim().toLowerCase();
	name = name.replace(/ +\(?early\)?/, '');
	name = name.replace(/^early +/, '');
	name = name.replace(/harvey court/, 'H.C.');
	name = name.replace(/ +hall$/, '');
	name = name.replace(/1st/, 'first');
	name = name.replace(/^pre term/, 'pre-term');
	return name;
}

var hallPageLoad = loggedIn
	.then(function() {
		return $.get('https://www.mealbookings.cai.cam.ac.uk/');
	})
	.then(function(mainPage) {
		return $(mainPage);
	})

var messagesLoad = hallPageLoad
	.then(function($mainPage) {
		return $mainPage.find('.message .announcement');
	});

var allergensLoad = messagesLoad
	.then(function($messages) {
		return Object.merge.apply(
			null,
			$messages.filter(function() {
				return $(this).text().includes('allergens');
			}).map(function() {
				let re = /^([A-Z]+)= (.*)$/gm;
				let text = $(this).text();
				let mapping = {}
				for (let match; (match = re.exec(text)) !== null;) {
					mapping[match[1]] = match[2]
				}
				return mapping;
			}).get()
		);
	})

var hallNameLoad = hallPageLoad
	.then(function($mainPage) {
		var bookingIds = $mainPage.find(".list a").map(function() {
			var m = /\?event=(\d+)/.exec($(this).attr('href'));
			if(m)
				return +m[1];
		}).get();

		var pageLoaders = bookingIds.map(function(id) {
			return $.get('https://www.mealbookings.cai.cam.ac.uk/index.php', {event: id}).then(function(d) {
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

				return {id: id, name: normalizeName(title), description: description, data: data}
			})
		});
		return $.whenAll(pageLoaders)
	})
	.then(function(titles) {
		// remove non-existant halls
		return titles.filter(function(x) { return x; });
	});

var lessCompiled = (function() {
	return $.get(chrome.extension.getURL('style.less')).then(function(lessStyle) {
		var d = $.Deferred();
		less.render(lessStyle, {
			paths: ['.'], // Specify search paths for @import directives
			filename: 'style-wrapper.less' // Specify a filename, for better error messages
		}, function (err, out) {
			if (err) {
				return d.reject(err);
			}
			d.resolve(out.css);
		});
		return d.promise();
	});
})();

chrome.extension.onRequest.addListener(function(request, sender, sendResponse) {
	loggedIn.resolve();

	analyticsLoad.then(function(payload) {
		$.getJSON('http://meals.efw27.user.srcf.net:8989/ping', payload);
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
	else if(request.action == 'getAllergens') {
		allergensLoad.then(function(x) {
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
