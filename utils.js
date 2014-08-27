// General purpose utilities

Date.extend({
	toISODateString: function() { return this.toISOString().substring(0, 10); },
	toLocalISODateString: function() { return this.toLocalISOString().substring(0, 10); },
	toLocalISOString: function() {
		function pad(n) { return n < 10 ? '0' + n : n }
		var localIsoString = this.getFullYear() + '-'
			+ pad(this.getMonth() + 1) + '-'
			+ pad(this.getDate()) + 'T'
			+ pad(this.getHours()) + ':'
			+ pad(this.getMinutes()) + ':'
			+ pad(this.getSeconds());
		if(this.getTimezoneOffset() == 0) localIsoString += 'Z';
		return localIsoString;
	}
});

Array.extend({
	// Behaves like itertools.groupby, maintaining sort order
	orderedGroupBy: function(map) {
		var keys = this.map(map);

		var group;
		var lastKey = function sentinel(){};
		var overall = [];
		this.each(function(el, index) {
			var key = keys[index];

			// no previous data for this key
			if(!Object.equal(key, lastKey)) {
				group = [];
				overall.push([key, group]);
			}

			group.push(el);
			lastKey = key;
		});

		return overall;
	},

	starMap: function(fn, context) {
		return this.map(function(el) {
			return fn.apply(context, el);
		});
	}
});

// jQuery configuration
$.ajaxPrefilter(function(options, originalOptions) {
	if(!originalOptions.dataFilter) {
		// encode root-level tags in a way that they can be interpreted
		options.dataFilter = function(htmlString) {
			return htmlString.replace(/<(\/?)(html|head|body|img)/g, '<$1ajax:$2')
		};
	}
});

$.whenAll = function(dfds) {
	return this.when.apply(this, dfds).then(function() {
		return [].slice.call(arguments);
	}).promise();
};

$.defer = function(f) {
	var d = $.Deferred();
	var args = [].slice.call(arguments, 1);
	args.push(d.resolve);
	f.apply(null, args);
	return d;
};

Object.method = function(o, name) {
	return o[name].bind(o);
}