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
