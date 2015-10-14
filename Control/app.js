// guideline: pressing any button should always be safe

// if there is ever no current we need to stop.. need to check multiple times though
// add more logs for state
// rewriting serial to handle out of order messages (and with echo enabled), chart them in realtime
// realtime preview from OF to iPad

var roboteq = require('./roboteq.js');
var osc = require('osc');
var express = require('express');
var app = express();

var revolutionsPerMeter = 16.818; // 14.16meters from floor at 120,000 = ~8611 counts per meter
var encoderResolution = 256;
var minimumVoltage = 23;
var countsPerMeter = revolutionsPerMeter * encoderResolution
var nudgeAmount = 0.10;
var safeDistance = 0.05;
var boxs = 10;
var boxac = 100;
var boxdc = 100;
var slows = 100;
var slowac = 1000;
var slowdc = 1000;
var fasts = 1300;
var fastac = 15000;
var fastdc = 12000;

function metersToEncoderUnits(meters) {
	return Math.round(countsPerMeter * meters)
}

function encoderUnitsToMeters(encoderUnits) {
	return encoderUnits / countsPerMeter;
}

var positions = {
	'top': 11.5,
	'boxtop': 10.05,
	'boxview': 9.5,
	'boxbottom': 8.9,
	'openair': 8.5,
	'myself': 2.0,
	'bottom': 0.1
};

var transitionDefault = {
	s: slows,
	ac: slowac,
	dc: slowdc
}

var transitions = {
	'shutdown': {end: 'bottom'},
	'top': {end: 'top'},
	'bottom': {end: 'bottom'},
	'scene1': {start: 'top', end: 'boxtop'},
	'scene2': {start: 'boxtop', end: 'boxview', s: boxs, ac: boxac, dc: boxdc},
	'scene3': {start: 'boxview', end: 'boxbottom', s: boxs, ac: boxac, dc: boxdc},
	'scene4': {start: 'boxbottom', end: 'openair'},
	'scene5': {start: 'openair', end: 'myself', s: fasts, ac: fastac, dc: fastdc}, // should be fast
	'scene6': {start: 'myself', end: 'openair'}, // should be slow
};

app.use(express.static(__dirname + '/public'));
app.use(express.static(__dirname + '/bower_components'));

var udpPort = new osc.UDPPort({
    localAddress: 'localhost'
});
udpPort.open();

var server = app.listen(process.env.PORT || 3000, function () {
	var host = server.address().address;
	var port = server.address().port;
	console.log('Listening at http://%s:%s', host, port);
});

// could pass encoder resolution here?
roboteq.connect({
	// these are limited internally as an error-check
	top: metersToEncoderUnits(11.5),
	bottom: metersToEncoderUnits(0.1),
	speedLimit: 1400,
	accelerationLimit: 15000,
	decelerationLimit: 12000
});

app.get('/roboteq/open', function(req, res) {
	res.json({
		'status': active ? roboteq.serialStatus() : 'Low Voltage',
		'open': roboteq.isOpen()
	})
})

setInterval(function() {
	if(active) {
		roboteq.getVolts(function(volts) {
			if(volts < minimumVoltage) {
				console.log('Past minimum voltage, shutting down.');
				safeApplyTransition('shutdown');
			}
		})
	}
}, 1000);

function applyTransition(transitionName) {
	var transition = transitions[transitionName];
	roboteq.setSpeed(transition.s || transitionDefault.s);
	roboteq.setAcceleration(transition.ac || transitionDefault.ac);
	roboteq.setDeceleration(transition.dc || transitionDefault.dc);
	var endPosition = positions[transition.end];
	roboteq.setPosition(metersToEncoderUnits(endPosition));
}

function getSafeTransitions(cb) {
	if(!active) {
		return [];
	}
	roboteq.getPosition(function(positionEncoder) {
		var positionMeters = encoderUnitsToMeters(positionEncoder);
		var safeTransitions = [];
		for(transitionName in transitions) {
			var transition = transitions[transitionName];
			var startPositionName = transition.start;
			if(startPositionName) {
				var startPositionMeters = positions[startPositionName];
				if(Math.abs(positionMeters - startPositionMeters) < safeDistance) {
					safeTransitions.push(transitionName);
				}
			} else {
				safeTransitions.push(transitionName);
			}
		}
		cb(safeTransitions);
	})
}

var active = true;
function safeApplyTransition(transitionName) {
	if(active) {
		if(transitionName == 'shutdown') {
			active = false;
		}
		getSafeTransitions(function(safe) {
			console.log('checking for ' + transitionName + ' in ' + safe);
			if(safe.indexOf(transitionName) > -1) {
				applyTransition(transitionName);
			} else {
				console.log('ignoring unsafe call to safeApplyTransition(' + transitionName + ')');			
			}
		})
	}
}

app.get('/roboteq/transition', function(req, res) {
	var name = req.query.name;
	console.log('/roboteq/transition to ' + name);
	safeApplyTransition(name);
	res.sendStatus(200);
})

app.get('/roboteq/nudge/up', function(req, res) {
	console.log('/roboteq/nudge/up');
	roboteq.setSpeed(slows);
	roboteq.setAcceleration(slowac);
	roboteq.setDeceleration(slowdc);
	roboteq.setPositionRelative(+metersToEncoderUnits(nudgeAmount));
	res.sendStatus(200);
})

app.get('/roboteq/nudge/down', function(req, res) {
	console.log('/roboteq/nudge/down');	
	roboteq.setSpeed(slows);
	roboteq.setAcceleration(slowac);
	roboteq.setDeceleration(slowdc);
	roboteq.setPositionRelative(-metersToEncoderUnits(nudgeAmount));
	res.sendStatus(200);
})

app.get('/roboteq/get/speed', function(req, res) {
  roboteq.getSpeed(function(result) {
    res.json({'speed': result});
  })
})

app.get('/roboteq/get/position', function(req, res) {
  roboteq.getPosition(function(result) {
    res.json({'position': result, 'meters': encoderUnitsToMeters(result)});
  })
})

app.get('/roboteq/get/volts', function(req, res) {
  roboteq.getVolts(function(result) {
    res.json({'volts': result});
  })
})

app.get('/roboteq/get/motor/amps', function(req, res) {
  roboteq.getMotorAmps(function(result) {
    res.json({'amps': result});
  })
})

app.get('/roboteq/get/battery/amps', function(req, res) {
  roboteq.getBatteryAmps(function(result) {
    res.json({'amps': result});
  })
})

app.get('/roboteq/get/destinationReached', function(req, res) {
  roboteq.getDestinationReached(function(result) {
    res.json({'destinationReached': result});
  })
})

app.get('/roboteq/set/echo', function(req, res) {
  var enable = (req.query.echo == 'true');
  roboteq.setEcho(enable);
  res.sendStatus(200);
})

app.get('/transitions/safe', function(req, res) {
	getSafeTransitions(function(safeTransitions) {
		res.json(safeTransitions);
	})
})

app.get('/transitions/all', function(req, res) {
	res.json(Object.keys(transitions));
})

function sendOsc(address, args) {
	udpPort.send({
	    address: address,
	    args: args
	}, 'localhost', 9000);
}

app.get('/oculus/lookAngle/add', function (req, res) {
	sendOsc('/lookAngle/add', [Number(req.query.value)]);
	res.sendStatus(200);
})

app.get('/oculus/screenshot', function (req, res) {
	sendOsc('/screenshot');
	res.sendStatus(200);
})