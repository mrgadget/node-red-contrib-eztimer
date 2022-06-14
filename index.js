const util = require('util');

/* eslint-disable no-invalid-this,consistent-this */
/**
 * The MIT License (MIT)
 *
 * Copyright (c) 2016 @biddster
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
'use strict';
module.exports = function(RED) {
    const moment = require('moment');
    const SunCalc = require('suncalc');
    const _ = require('lodash');
    const fmt = 'YYYY-MM-DD HH:mm:ss';
    const sunTimes = [
        "solarNoon",
        "goldenHourEnd",
        "goldenHour",
        "sunriseEnd",
        "sunsetStart",
        "sunrise",
        "sunset",
        "dawn",
        "dusk",
        "nauticalDawn",
        "nauticalDusk",
        "nightEnd",
        "night",
        "nadir"
    ];

    RED.nodes.registerType('eztimer', function(config) {
        RED.nodes.createNode(this, config);
        const node = this
        let events = {};
        let state = false;
        let resendInterval;
        let resendObj;
        let inputMsg = {};

        RED.httpAdmin.get("/eztimer/getHaZones", RED.auth.needsPermission('serial.read'), function(req,res) {
            let ha = node.context().global.get('homeassistant');
            let zones = [];

            let servers = Object.keys(ha);
            let multipleServers = servers.length > 1;
            for (server of servers) {
              for (element in ha[server].states) {
                let zone = ha[server].states[element];
                if (element.substring(0, 4) == "zone") {
                  let z = {
                    entity_id: zone.entity_id,
                    name: multipleServers
                      ? `${server}: ${zone.attributes.friendly_name}`
                      : zone.attributes.friendly_name,
                    latitude: zone.attributes.latitude,
                    longitude: zone.attributes.longitude,
                  };
                  if (z.entity_id.substring(0, 9) == "zone.home") zones.unshift(z);
                  else zones.push(z);
                }
              }
            }
            res.json(zones);
        });

        switch (config.timerType) {
            case '1':
                events.on = setupEvent('on', 'dot');
                events.off = setupEvent('off', 'ring');
                break;
            case '2':
                events.on = setupEvent('on', 'ring');
                events.off = null;
                break;
        }

        if (events.on && events.off) {
            events.on.inverse = events.off;
            events.off.inverse = events.on;
        }

        // Init resend
        if (config.resend) {
            resendInterval = getSeconds(config.resendInterval);
            if (resendInterval > 0) {
                log(1, 'Re-send interval = ' + resendInterval + ' seconds.');
                resend()
            } else {
                log(1, 'Re-send disabled.');
            }
        }

        function resend() {
            resendObj = setTimeout(function() {
                if (events.last) send(events.last, true);
                resend()
            }, (resendInterval) * 1000);
        }

        function weekdays() {
            return [
                config.mon,
                config.tue,
                config.wed,
                config.thu,
                config.fri,
                config.sat,
                config.sun
            ];
        }

        node.on('input', function(msg) {
            inputMsg = msg;
            let handled = false,
            requiresBootstrap = false;
            if (msg.payload == null) {
                // Unsuppored input
                node.error("Null or undefined (msg.payload) input.")
            } else if (_.isString(msg.payload)) {
                handled = action('payload string', msg)
            } else {
                if (msg.payload.hasOwnProperty('suspended')) {
                    handled = true;
                    const previous = config.suspended;
                    config.suspended = !!msg.payload.suspended;
                    requiresBootstrap = requiresBootstrap || previous !== config.suspended;
                }
                if (msg.payload.hasOwnProperty('manual')) {
                    handled = true;
                    const previous = config.suspended;
                    config.suspended = !!msg.payload.manual;
                    requiresBootstrap = requiresBootstrap || previous !== config.suspended;
                }
                if (msg.payload.hasOwnProperty('action')) {
                    handled = action('action', msg.payload.action);
                }
                enumerateProgrammables(function(obj, prop, payloadName, typeConverter) {
                    if (msg.payload.hasOwnProperty(payloadName)) {
                        handled = true;
                        const previous = obj[prop];
                        obj[prop] = typeConverter(msg.payload[payloadName]);
                        requiresBootstrap = requiresBootstrap || (previous !== obj[prop] && dynamicDuration(prop, obj[prop]));
                    }
                });
                if (!handled) node.error("Invalid object (msg.payload) input.")
            }
            if (!handled) {
                node.status({
                    fill: 'red',
                    shape: 'dot',
                    text: 'Unsupported input'
                });
            } else if (requiresBootstrap) {
                bootstrap();
            }
        });

        function action(source, msg) {
            const data = msg.payload
            let handled = false;
            if (data === 'on') {
                // Sends the on event without impacting the scheduled event
                handled = true;
                send(events.on, true);
                if (events.off && events.off.type == '3') schedule(events.off, null, true); // If 'off' is of type duration, schedule 'off' event.
                updateStatus();
            } else if (data === 'off' && config.timerType == '1') {
                // Sends the off event, then re-schedules it
                handled = true;
                clearTimeout(events.off.timeout);
                events.off.moment = null;
                send(events.off, true);
                if (!isSuspended() && events.off.type != '3') schedule(events.off);
                updateStatus();
            } else if (data === 'trigger') {
                // Sends the trigger/on event without impact the scheduled event
                handled = true;
                send(events.on);
                updateStatus();
            } else if (data === 'cancel' && config.timerType == '1') {
                // Cancels the current timer without sending the off event
                handled = true;
                if (!isSuspended()) {
                    schedule(events.on);
                    clearTimeout(events.off.timeout);
                    state = false;
                    events.off.moment = null;
                    if (!isSuspended() && events.off.type != '3') schedule(events.off);
                }
                updateStatus();
            } else if (data === 'info') {
                handled = true;
                let info = getInfo();
                // Info is now sent with every output - continue to send as payload for backward compatibiliy.
                node.send({
                    topic: 'info',
                    info: info,
                    tag: config.tag || 'eztimer',
                    payload: info,
                    _linkSource: msg._linkSource,
                });
            } else if (data === 'sync') {
                handled = true;
                sync();
            } else {
                // if (data.indexOf('suspended') !== -1) {
                //     handled = true;
                //     const match = /.*suspended\s+(\S+)/.exec(data);
                //     const previous = config.suspended;
                //     config.suspended = toBoolean(match[1]);
                //     requiresBootstrap = requiresBootstrap || (previous !== config.suspended && config.sendEventsOnSuspend);
                // }
                // enumerateProgrammables(function(obj, prop, payloadName, typeConverter) {
                //     const match = new RegExp(`.*${payloadName}\\s+(\\S+)`).exec(data);
                //     if (match) {
                //         handled = true;
                //         const previous = obj[prop];
                //         obj[prop] = typeConverter(match[1]);
                //         requiresBootstrap = requiresBootstrap || (previous !== obj[prop] && dynamicDuration(prop, obj[prop]));
                //     }
                // });
                switch (source) {
                    case 'payload string':
                        node.error("Invalid action input (via msg.payload string)");
                        break;
                    case 'action':
                            node.error("Invalid action input (via msg.payload object action property)");
                            break;
                }
            }
            return handled;
        }

        function getInfo() {
            let ret = {
                name: node.name || 'eztimer',
                state: function() {
                    if (config.timerType == '2') return undefined; // Trigger
                    if (isSuspended()) return 'suspended';
                    if (state) { return 'on' } else { return 'off' }
                }()
            };
            if (config.timerType == '1') {
                // on/off timer type
                ret.on = {
                    property: (events.on.propertytype || 'msg') + '.' + events.on.property,
                    value: getValue(events.on) || "<none>",
                    nextEvent: function() {
                        if (isSuspended()) return 'suspended';
                        if (events.on.type == '9') return 'manual';
                        if (!events.on.moment) return 'error';
                        return events.on.moment.local().toDate()
                    }()
                };
                ret.off = {
                    property: (events.off.propertytype || 'msg') + '.' + events.off.property,
                    value: getValue(events.off) || "<none>",
                    nextEvent: function() {
                        if (config.timerType == '2') return undefined; // Trigger
                        if (isSuspended()) return 'suspended';
                        if (!events.off.moment) return 'manual';
                        return events.off.moment.toDate()
                    }()
                };
            } else {
                // trigger timer type
                ret.trigger = {
                    property: (events.on.propertytype || 'msg') + '.' + events.on.property,
                    value: getValue(events.on) || "<none>",
                    nextEvent: function() {
                        if (isSuspended()) return 'suspended';
                        if (events.on.type == '9') return 'manual';
                        if (!events.on.moment) return 'error';
                        return events.on.moment.toDate()
                    }()
                };
            }
            return ret;
        }

        function log(level, message) {
            if (config.debug) level = Math.max(3, level); //Outputs everything in node warn or error.
            switch (level) {
                case 1: //verbose, ignore
                    break;
                case 2:
                    node.log(message); // log to node console only
                    break;
                case 3:
                    node.warn(message); // log to node debug window
                    break;
                default:
                    node.error(message); //anything above 3.
            }
        }

        function dynamicDuration(property, duration) {
            // Return false if not a duration request
            if (property == "offtime" && state) {
                schedule(events.off, null, true);
            } else if (property == "duration") {
                if (state) {
                    // Timer currently 'on' - parse time
                    let secs = getSeconds(duration);
                    let offTime = moment(events.on.last.moment).add(secs, 'seconds');

                    if (offTime.isBefore(node.now())) {
                        // New time is before now - need to turn off and schedule
                        log(2, "Live duration change (" + duration + " => " + secs + "s) causes an off-time in the past, sending 'off' event.");
                        send(events.off);
                        schedule(events.off);
                    } else {
                        // New time is after now - just update the scheduled off event (and status)
                        log(2, "Live duration change (" + duration + " => " + secs + "s), rescheduling 'off' time to " + offTime.toString());
                        schedule(events.off, null, true);
                    }
                } else {
                    // Timer currently 'off', just re-schedule of off event (if an on event is scheduled)
                    if (!isSuspended()) {
                        schedule(events.off);
                    }
                }
            } else {
                return true;
            }

            updateStatus();

            // Return false to indicate no bootstrap required
            return false;
        }

        function getSeconds(val) {
            let secs = 0;

            // accept 00:00, 00:00:00, 45s, 45h,4m etc.
            let matches = new RegExp(/(?:(\d+)[h:\s,]+)?(?:(\d+)[m:\s,]+)?(?:(\d+)[s\s]*)?$/).exec(val);
            if (matches.length > 1) {
                if (matches[1] != null) {
                    secs += parseInt(matches[1]) * 3600; // hours
                }
                if (matches[2] != null) {
                    secs += parseInt(matches[2]) * 60; // minutes
                }
                if (matches[3] != null) {
                    secs += parseInt(matches[3]) * 1; // seconds
                }
            } else {
                return 0;
            }

            return secs;
        }

        node.on('close', suspend);

        function setupEvent(eventName, shape) {
            const filtered = _.pickBy(config, function(value, key) {
                return key && key.indexOf(eventName) === 0;
            });
            const event = _.mapKeys(filtered, function(value, key) {
                return key.substring(eventName.length).toLowerCase();
            });
            event.name = eventName.toUpperCase();
            event.shape = shape;
            event.state = (eventName == 'on');
            event.last = { moment: null };
            event.callback = function() {
                // Send the event
                send(event);
                if (!isSuspended()) {
                    // Schedule the next event, if it's not a 'manual' timer
                    schedule(event, null, null);
                } else {
                    // Else just clear the event - we don't know when the off event will be
                    event.moment = undefined;
                }
                // Update the status/icon
                updateStatus();
            };
            return event;
        }

        function getValue(event) {
            // Parse value to selected format
            let tgtValue = event.value;
            switch (event.valuetype) {
                case 'flow':
                    tgtValue = node.context().flow.get(tgtValue);
                    break;
                case 'global':
                    tgtValue = node.context().global.get(tgtValue);
                    break;
                case 'json':
                    tgtValue = JSON.parse(tgtValue);
                    break;
                case 'bool':
                    tgtValue = (tgtValue == "true");
                    break;
                case 'date':
                    tgtValue = (new Date()).getTime();
                    break;
                case 'num':
                    tgtValue = parseFloat(tgtValue);
                    break;
            }
            return tgtValue;
        }

        function sync() {
            if (events.last) send(events.last);
        }

        function send(event, manual) {
            if (!event.suppressrepeats || state != event.state) {
                log(1, 'emitting \'' + event.name + '\' event');
                event.last.moment = node.now();
                events.last = event;
    
                // Output value
                switch (event.propertytype || 'msg') {
                    case "flow":
                        node.context().flow.set(event.property, getValue(event));
                        break;
                    case "global":
                        node.context().global.set(event.property, getValue(event));
                        break;
                    case "msg":
                        let msg = {};
                        msg.info = getInfo();
                        msg.tag = config.tag || 'eztimer';
                        msg.topic = config.topic || '';
                        let currPart = msg;
                        let spl = event.property.split('.');
                        for (let i in spl) {
                            if (i < (spl.length - 1)) {
                            if (!currPart[spl[i]]) currPart[spl[i]] = {};
                                currPart = currPart[spl[i]];
                            } else {
                                currPart[spl[i]] = getValue(event);
                            }
                        }
                        msg._payload = inputMsg.payload;
                        node.send(msg);
                    break;
                }
            }

            state = event.state;
        }


        function schedule(event, init, manual) {
            let now = node.now();

            switch (event.type) {
                case '1': //Sun
                    event.typeName = 'sun';
                    let nextDate = new Date();
                    // Get tomorrow's sun data
                    if (!init) nextDate = nextDate.setDate(nextDate.getDate() + 1);
                    const sunCalcTimes = SunCalc.getTimes(nextDate, config.lat, config.lon);
                    // Get first event - move closer to noon if required.
                    let t = sunTimes.indexOf(event.timesun);
                    while (!moment(sunCalcTimes[sunTimes[t]]).isValid()) t = Math.max(t - 2, 0);
                    // If we've had to move closer to noon, emit a warning
                    if (event.timesun != sunTimes[t]) {
                        log(4, { "message": 'Sun event (' + event.timesun + ') invalid for chosen lat/long (due to polar proximity). Sun event \'' + sunTimes[t] + '\' has been chosen as the closest valid candidate.', "events": sunCalcTimes});
                    }
                    // Use determined event time
                    let date = sunCalcTimes[sunTimes[t]];
                    if (date && moment(date).isValid()) {
                        event.moment = moment(date);
                    } else {
                        event.error = 'Unable to determine time for \'' + event.timesun + '\'';
                    }

                    break;
                case '2': //Time of Day
                    if (event.timetod == '') {
                        event.moment = null;
                        return true;
                    }
                    event.typeName = 'time of day';
                    let m = node.now().millisecond(0);
                    let re = new RegExp(/\d+/g);
                    let p1, p2, p3;
                    p1 = re.exec(event.timetod);
                    if (p1) p2 = re.exec(event.timetod);
                    if (p2) p3 = re.exec(event.timetod);

                    if (p3) {
                        m.hour(+p1[0]).minute(+p2[0]).second(+p3[0]);
                    } else if (p2) {
                        m.hour(+p1[0]).minute(+p2[0]).second(0);
                    } else {
                        m = null;
                    }
                    if (m) {
                        event.moment = m;
                        // If a standard run, add a day
                        if (!init && !m.isAfter(now)) event.moment = event.moment.add(1, 'days');
                    } else {
                        event.moment = null;
                    }

                    break;
                case '3': //Duration
                    event.typeName = 'duration';
                    let secs = getSeconds(event.duration);

                    if (manual && event.inverse.last.moment) {
                        //event is manual - schedule based on last 'on' event
                        event.moment = moment(event.inverse.last.moment).add(secs, 'seconds');
                    } else if (event.inverse.moment) {
                        // event is auto - schedule based on current 'on' event
                        event.moment = moment(event.inverse.moment).add(secs, 'seconds');
                    } else {
                        event.moment = null;
                        return true;
                    }

                    // See if we can roll back a day - the on-time has passed, but the off-time might not have.
                    if (init && moment(event.moment).add(-1, 'days').isAfter(now)) {
                        event.moment.add(-1, 'day');
                    }

                    break;
                case '9': //Manual
                    event.typeName = 'manual';
                    event.moment = null;
                    return true;
            }

            if (!event.moment) {
                node.status({
                    fill: 'red',
                    shape: 'dot',
                    text: event.error ? event.error : `Invalid time: ${event.timetod}`
                });
                return false;
            }

            if (event.offset) {
                let adjustment = event.offset;
                if (event.randomoffset) {
                    adjustment = event.offset * Math.random();
                }
                event.moment.add(adjustment, 'minutes');
            }

            // Add a day if the moment is in the past
            if (now.isAfter(event.moment)) {
                event.moment.add(1, 'day');
            }

            // Adjust weekday if not selected (and not manual)
            while (!manual && !weekdays()[event.moment.isoWeekday() - 1]) {
                event.moment.add(1, 'day');
            }

            // Log event
            log(1, "Scheduled '" + event.name + "' (" + event.typeName + ") for " + event.moment.toString());

            // Clear any pending event
            if (event.timeout) clearTimeout(event.timeout);

            //console.log('schedule: ' + event.name + ' => ' + event.moment.toString());
            const delay = event.moment.diff(now);
            event.timeout = setTimeout(event.callback, delay);
            return true;
        }

        function updateStatus() {
            let message = null;

            // Determine the next event
            let nextEvent = null;
            switch (config.timerType) {
                case "1": // on/off
                    if (state) {
                        if (events.off && events.off.moment) nextEvent = events.off;
                    } else {
                        if (events.on.moment) nextEvent = events.on;
                    }
                    message = {
                        fill: 'green',
                        shape: state ? 'dot' : 'ring',
                        text: state ? events.on.name : events.off.name
                    };
                    if (nextEvent) message.text += ` until ${nextEvent.moment.format(fmt)}`;
                    break;
                case "2": // trigger
                    if (events.on.moment) nextEvent = events.on;
                    message = {
                        fill: 'green',
                        shape: 'ring',
                        text: ''
                    };
                    if (nextEvent) message.text = `trigger @ ${nextEvent.moment.format(fmt)}`;
                    break;
            }

            if (!nextEvent) {
                if (isSuspended()) {
                    if (!state) message.fill = 'grey';
                    message.shape = 'dot';
                    message.text = 'scheduling suspended';
                } else {
                    message.text += ', no scheduled event';
                }
                message.text += weekdays().indexOf(true) === -1 ? ' (no weekdays selected) ' : '';
            }
            node.status(message);
        }

        function suspend() {
            if (events.off) {
                if (config.sendEventsOnSuspend) send(events.off);
                clearTimeout(events.off.timeout);
                events.off.moment = null;
            }

            clearTimeout(events.on.timeout);
            clearTimeout(resendObj);
            events.on.moment = null;

            updateStatus();
        }

        function resume() {
            let on = events.on.type != '9' && schedule(events.on, true);
            let off = (!events.off || (events.off && events.off.type != '9' && schedule(events.off, true)));
        }

        function bootstrap() {
            if (isSuspended()) {
                suspend();
            } else {
                resume();

                // Wait 500ms for startup, then fire PREVIOUS event to ensure we're in the right state.
                setTimeout(function() {
                    if (events.on && events.on.moment && events.off && events.off.moment) {
                        if (events.off.moment.isAfter(events.on.moment)) {
                            //Next event is ON, send OFF
                            if (config.startupMessage && config.startupMessage == true) {
                                send(events.off);
                            } else {
                                state = false;
                            }
                        } else {
                            //Next event is OFF, send ON
                            if (config.startupMessage && config.startupMessage == true) {
                                send(events.on);
                            } else {
                                state = true;
                            }
                        }
                    } else if (events.on && (!events.off || events.off.type == '9')) {
                        //Trigger
                        if (config.startupMessage && config.startupMessage == true) {
                            send(events.on);
                        }
                    }
                    updateStatus();
                }, 500);
            }
        }

        function isSuspended() {
            return config.suspended || weekdays().indexOf(true) === -1;
        }

        function enumerateProgrammables(callback) {
            callback(events.on, 'type', 'ontype', String);
            callback(events.on, 'timetod', 'triggertime', String);
            callback(events.on, 'timetod', 'ontime', String);
            callback(events.on, 'value', 'triggervalue', String);
            callback(events.on, 'value', 'onvalue', String);
            callback(events.on, 'offset', 'onoffset', Number);
            callback(events.on, 'randomoffset', 'onrandomoffset', toBoolean);
            callback(events.off, 'type', 'offtype', String);
            callback(events.off, 'timetod', 'offtime', String);
            callback(events.off, 'duration', 'duration', String);
            callback(events.off, 'value', 'offvalue', String);
            callback(events.off, 'offset', 'offoffset', Number);
            callback(events.off, 'randomoffset', 'offrandomoffset', toBoolean);
            callback(config, 'tag', 'tag', String);
            callback(config, 'topic', 'topic', String);
            callback(config, 'mon', 'mon', toBoolean);
            callback(config, 'tue', 'tue', toBoolean);
            callback(config, 'wed', 'wed', toBoolean);
            callback(config, 'thu', 'thu', toBoolean);
            callback(config, 'fri', 'fri', toBoolean);
            callback(config, 'sat', 'sat', toBoolean);
            callback(config, 'sun', 'sun', toBoolean);
            callback(config, 'lon', 'lon', Number);
            callback(config, 'lat', 'lat', Number);
        }

        function toBoolean(val) {
            // eslint-disable-next-line prefer-template
            return (val + '').toLowerCase() === 'true';
        }

        // Bodges to allow testing
        node.eztimerEvents = () => events;
        node.eztimerConfig = () => config;
        node.now = moment;

        bootstrap();
    });
};

