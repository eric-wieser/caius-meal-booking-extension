var friendLoader = $.defer(Object.method(chrome.storage.sync, 'get'), "friends").then(function(data) {
	var f = data.friends;
	// first load - no data
	if(!f)
		return [];
	// old format - add another layer of array
	else if(f.length > 0 && f[0].constructor === String)
		return [f];
	// new format
	else
		return f;
});


$.when(
	$.defer(Object.method(chrome.extension, 'sendRequest'), {action: 'getTemplates'}),
	$.defer(Object.method(chrome.extension, 'sendRequest'), {action: 'getPreferences'}),
	$.defer(Object.method(chrome.extension, 'sendRequest'), {action: 'getLess'}),
	$.defer($(document).ready)
).then(function domLoaded(templates, preferences, less) {

	console.log(preferences);

	var css = $("<style>").html(less).appendTo(document.head);

	if(preferences.vegetarian)
		$('body').addClass('diet-vegetarian');

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
			friendsElem.val(friends.map(function(x) { return x.join('\n'); }).join('\n\n'));
			friendsElem.prop('disabled', false);
		});

		$('form').submit(function() {
			friendsElem.removeAttr('name');
			var friends = friendsElem.val().trim()
				.split('\n\n')
				.map(function(x) {
					return x.split('\n');
				});
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
		toolbar.appendTo('body');
		var attendeeWrapper = $('<div>').addClass('attendee-wrapper').appendTo('body');

		function generateDayElement(date, halls) {
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


			dayElem.find('.hall').each(function(i) {
				var hallElem = $(this);
				var hall = halls[i];
				$.when(hall.loadAttendees(), friendLoader).done(function(_, friends) {
					var list = $();
					if(hall.attendees.length) {
						list = $('<div>').hide();

						// convert to a set
						var attendeeSet = {};
						var outputSet = {};
						hall.attendees.each(function(a) {
							attendeeSet[a.name] = a;
						});

						var makeName = function(o) {
							var e = $('<span>').addClass('attendee').text(o.name);
							if(o.guestCount) {
								var plus = $('<span>').addClass('guests').text('+'+o.guestCount).appendTo(e);
								if(o.guests)
									plus.attr('title', o.guests).addClass('detailed');
							}

							return e;
						}

						// output each friend group
						friends.each(function(group) {
							var friendsElem;
							group.each(function(f) {
								if(attendeeSet[f]) {
									if(!friendsElem)
										friendsElem = $('<span>').addClass('friendgroup').appendTo(list);
									makeName(attendeeSet[f]).appendTo(friendsElem);
									outputSet[f] = true;
								}
							});
						});
						hall.attendees.each(function(a) {
							if(!outputSet[a.name])
								makeName(a).appendTo(list);
						});
						list.appendTo(attendeeWrapper);
					}
					hallElem.on('mouseenter', function() {
						attendeeWrapper.children('div').hide();
						list.show().focus();
						$('.days').css('padding-bottom', list.height());
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
					$('<div>').addClass('menu-course').html(course).appendTo(elem);
				})
				return elem;
			}

			var menuTasks = halls.map('loadMenu');
			$.whenAll(menuTasks).done(function() {
				var first = halls[0];
				var notUnique = halls.all(function(h) { return !h.menu || Object.equal(h.menu, first.menu); });
				var hasMenu = false;
				var wrapper = $('<div>').addClass('menus');
				if(notUnique) {
					if(first.menu) {
						makeMenu(first.menu).appendTo(wrapper);
						hasMenu = true;
					}
				} else {
						var wrapper = $('<div>').addClass('menus').appendTo(dayElem);
					halls.each(function(h) {
						if(h.menu) {
							hasMenu = true;
							makeMenu(h.menu).appendTo(wrapper);
							console.log(JSON.stringify(h.menu));
						}
					});
				}
				if(hasMenu)
					wrapper.appendTo(dayElem);

				else
					dayElem.addClass('nomenu')

				dayElem.removeClass('loading');
			});

			return dayElem;
		}

		var daysElem = $('<div>').addClass('days');
		HallSummary.loadAll({from: new Date()}).done(function(all) { all
			.sortBy('date')
			.orderedGroupBy('date')
			.starMap(generateDayElement)
			.each(function(dayElem) {
				// emit html
				dayElem.appendTo(daysElem);
			});

			daysElem.appendTo('body');
		});

		var oldLoaded = false;
		toolbar.find('.toggle-past-halls').click(function() {
			if(!oldLoaded) {
				var ppl = $('<div>').addClass('past-present-line').text("Previous halls")
				ppl.insertAfter(toolbar);
				HallSummary.loadAll({to: new Date().addDays(-1)}).done(function(all) { all
					.sortBy('date')
					.orderedGroupBy('date')
					.starMap(generateDayElement)
					.each(function(dayElem) {
						dayElem.insertBefore(ppl);
					});
				});
				oldLoaded = true;
			}
			$('body').toggleClass('show-past-halls');
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
