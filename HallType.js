var HallType = function(name, id) {
	this.name = name;
	this.id = id;
}

HallType.all = [
	new HallType('first', 256),
	new HallType('formal', 257),
	new HallType('sunday formal', 258),
	// 259 - 261: unused
	new HallType('cafeteria', 262),
	new HallType('pre-term', 263),
	// 264 - 273: unused
	new HallType('corporate communion', 274),
	// 275: Error!
	new HallType('first (early)', 276),
	// 277 - 278: unused
	new HallType('christmas first', 279),
	new HallType('christmas formal', 280),
	new HallType('superhall', 282),
	// 283 - 289: unused
	new HallType('first', 290),
	new HallType('formal', 291),
	new HallType('sunday formal', 292),
	// 292 - 295: unused
	new HallType('cafeteria', 296),
	new HallType('pre-term', 297)
];
