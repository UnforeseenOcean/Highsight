// try using px instead of p to avoid overwriting commands
// check ?dr 1

var serialport = require('serialport');

function getComName(cb) {
	serialport.list(function(err, ports) {
		ports.forEach(function(port) {
			if(port.manufacturer == 'Roboteq') {
				cb(null, port.comName);
				return;
			}
		})
		cb('Cannot find matching port.');
	})
}

var serial;
var serialStatus = 'initializing';
function updateSerialStatus(status) {
	if(status != serialStatus) {
		console.log('Roboteq is ' + status);
	}
	serialStatus = status;
}

exports.connect = function() {
	if(serial && serial.isOpen()) return;
	getComName(function(err, comName) {
		if(err) {
			updateSerialStatus('not found, searching');
			reconnect();
			return;
		}
		serial = new serialport.SerialPort(comName, {
			baudrate: 115200,
			parser: serialport.parsers.readline('\r'),
			disconnectedCallback: function() {
				updateSerialStatus('disconnected, reconnecting');
				reconnect();
			}
		}, false);
		serial.open(function(err) {
			if(err) {
				updateSerialStatus('error connecting, reconnecting');
				reconnect();
			} else {
				updateSerialStatus('connected');
			}
		});
	})
}
function reconnect(description) {
	setTimeout(exports.connect, 1000);
}

exports.isOpen = function() {
	return Boolean(serial && serial.isOpen());
}

exports.serialStatus = function() {
	return serialStatus;
}

exports.command = function(command) {
	if(!exports.isOpen()) {
		console.log('Ignored command: ' + command);
		return;
	}
	serial.write(command + '\r\n', function(err, results) {
		if(err) console.log('err ' + err);
		if(results) console.log('results ' + results);
	});
}

exports.query = function(query, cb) {
	if(!exports.isOpen()) {
		console.log('Ignored query: ' + query);
		cb();
		return;
	}
	serial.on('data', function(data) {
		if(!data) {
			console.log('data event with no data');
			return;
		}
		console.log('got data: ' + data);
		var parts = data.split('=')[0];
		var type = parts[0].toLowerCase();
		cb(type, parts[1]);
	});
	serial.write(query + '\r\n', function(err, results) {
		if(err) console.log('err ' + err);
		if(results) console.log('results ' + results);
	});
}

// based on:
// http://www.roboteq.com/index.php/docman/motor-controllers-documents-and-files/documentation/user-manual/7-nextgen-controllers-user-manual/file
exports.setAcceleration = function(acceleration) {
	exports.command('!AC 1 ' + acceleration);
}
exports.setDeceleration = function(deceleration) {
	exports.command('!DC 1 ' + deceleration);
}
exports.setSpeed = function(speed) { // units are .1 * RPM / s, called "set velocity" in manual
	exports.command('!S 1 ' + speed);
}
exports.setPosition = function(position) {
	exports.command('!P 1 ' + position);
}
exports.getPosition = function(cb) {
	exports.query('?C 1', cb); // also called "encoder counter absolute"
}
exports.getSpeed = function(cb) {
	exports.query('?S 1', cb);
}
exports.getVolts = function(cb) {
	exports.query('?V 1', cb); // returns internal voltage * 10 : main battery voltage * 10 : v5out on dsub in millivolts, see p 186
}
exports.getMotorAmps = function(cb) { // returns units of amps * 10, p 173
	exports.query('?A 1', cb);
}
exports.getBatteryAmps = function(cb) { // returns units of amps * 10, p 175
	exports.query('?BA 1', cb);
}
exports.getDestinationReached = function(cb) { // p 179, p 104
	exports.query('?DR 1', cb);
}
exports.getFaults = function(cb) {
	exports.query('?FF 1', cb); // see p 180 for the meaning of each bit
}
exports.getRuntimeStatus = function(cb) {
	exports.query('?FM 1', cb); // see p 181 for the meaning of each bit
}
exports.getStatus = function(cb) {
	exports.query('?FS 1', cb); // see p 181 for the meaning of each bit
}
// see p 188 and 189 for a way to set up the roboteq to automatically return stats