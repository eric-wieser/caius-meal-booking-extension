var friendLoader = $.defer(Object.method(chrome.storage.sync, 'get'), "friends").then(function(data) {
	return data.friends || [];
});

$.when(
	$.defer(Object.method(chrome.extension, 'sendRequest'), {action: 'getTemplates'}),
	$.defer(Object.method(chrome.extension, 'sendRequest'), {action: 'getPreferences'}),
	$.defer($(document).ready)
).then(function domLoaded(templates, preferences) {

	console.log(preferences);

	// Add sidebar link
	$('.sidebar ul li:last-child').before(
		$('<li>').append(
			$('<a>').attr('href', '/menus').text('Summary')
		)
	);

	if(location.pathname == '/profile.php') {
		var friendsElem;
		$('table.form').append(
			$('<tr>').append(
				$('<th>').append(
					$('<label>').attr('for', 'friends').text('Friends:')
				),
				$('<td>').append(
					friendsElem = $('<textarea>').attr('cols', 40). attr('rows', 40).attr('name', 'friends').prop('disabled', true)
				)
			)
		);
		friendLoader.then(function(friends) {
			friendsElem.val(friends.join('\n'));
			friendsElem.prop('disabled', false);
		});

		$('form').submit(function() {
			friendsElem.removeAttr('name');
			var friends = friendsElem.val().trim().split('\n');
			chrome.storage.sync.set({friends: friends});
		})
	}

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
					$.when(hall.loadAttendees(), friendLoader).done(function(_, friends) {
						var list = $();
						if(hall.attendees.length) {
							list = $('<div>').hide();
							var friendsElem = $('<strong>').appendTo(list);
							hall.attendees.each(function(a) {
								if(friends.indexOf(a.name) != -1)
									$('<span>').text(a.name).appendTo(friendsElem);
								else
									$('<span>').text(a.name).appendTo(list);
							});
							list.appendTo(attendeeWrapper);
						}
						hallElem.on('mouseenter', function() {
							attendeeWrapper.children('div').hide();
							list.show().focus();
						});
					});
					hall.loadBookableness().then(function(isBookable) {
						if(isBookable)
							hallElem.addClass('hall-bookable');
					});
					hallElem.find('.booking-button-book').on('click', function() {
						hall.makeBooking(preferences).then(function() {
							location.reload();
						});
						return false;
					});
					hallElem.find('.booking-button-cancel').on('click', function() {
						if(confirm("Are you sure you want to delete this booking?")) {
							hall.clearBooking().then(function() {
								location.reload();
							});
						}
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

			$('.day-past').last().after(
				$('<div>').addClass('past-present-line').text("Previous halls")
			);
		});
	}


	if(location.pathname == '/prebook') {
		var christmasDinner = new HallSummary(new HallType('christmas formal', 280));
		christmasDinner.date = new Date(2013, 11, 4);
		console.log(christmasDinner.url);

		var then = new Date(2013, 10, 30, 6);

		var retry = function() {
			christmasDinner.makeBooking({}).then(function() {
				document.write("success<br />");
				document.write(christmasDinner.url);
			}, function(err) {
				var timeLeft = then - new Date();
				var waitfor = Math.max(timeLeft / 2, 1000);
				document.write("Failed at " + new Date()+", waiting for " + waitfor/1000.0 + "seconds <br />");
				setTimeout(retry, waitfor);
				console.log(timeLeft);
			});
		}

		retry();

	}
});
