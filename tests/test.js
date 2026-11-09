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

const assert = require('chai').assert;
const _ = require('lodash');
const moment = require('moment');
const mock = require('node-red-contrib-mock-node');
const nodeRedModule = require('../index.js');

describe('eztimer', function() {
    it('should schedule initially', function() {
        const node = newNode();
        assert.strictEqual(node.eztimerEvents().on.time, '11:45');
        assert.strictEqual(node.eztimerEvents().off.time, 'dawn');

        node.emit('input', {
            payload: 'on'
        });
        assert.strictEqual(node.sent(0).payload, 'on payload');
        assert.strictEqual(node.sent(0).topic, 'on topic');

        node.emit('input', {
            payload: 'off'
        });
        assert.strictEqual(node.sent(1).payload, 'off payload');
        assert.strictEqual(node.sent(1).topic, 'off topic');
    });
    it('should handle programmatic scheduling', function() {
        const node = newNode();
        node.emit('input', {
            payload: 'ontime 11:12'
        });
        assert.strictEqual(node.eztimerEvents().on.time, '11:12');

        node.emit('input', {
            payload: {
                ontime: '23:12'
            }
        });
        assert.strictEqual(node.eztimerEvents().on.time, '23:12');

        node.emit('input', {
            payload: 'offtime 10:12'
        });
        assert.strictEqual(node.eztimerEvents().off.time, '10:12');

        node.emit('input', {
            payload: {
                offtime: '22:12'
            }
        });
        assert.strictEqual(node.eztimerEvents().off.time, '22:12');

        node.emit('input', {
            payload: 'mon true'
        });
        assert.strictEqual(node.eztimerConfig().mon, true);

        node.emit('input', {
            payload: 'mon false'
        });
        assert.strictEqual(node.eztimerConfig().mon, false);

        node.emit('input', {
            payload: { mon: true }
        });
        assert.strictEqual(node.eztimerConfig().mon, true);

        node.emit('input', {
            payload: { lat: -1.1 }
        });
        assert.strictEqual(node.eztimerConfig().lat, -1.1);

        node.emit('input', {
            payload: 'lat -99.9'
        });
        assert.strictEqual(node.eztimerConfig().lat, -99.9);
    });
    it('should indicate bad programmatic input', function() {
        const node = newNode();
        node.emit('input', {
            payload: 'wibble'
        });
        assert.strictEqual(node.status().text, 'Unsupported input');

        node.status().text = '';
        node.emit('input', {
            payload: '4412'
        });
        assert.strictEqual(node.status().text, 'Unsupported input');
    });
    it('should indicate bad configuration', function() {
        const node = newNode({
            ontime: '5555'
        });
        assert.strictEqual(node.status().text, 'Invalid time: 5555');
    });
    it('should suspend initially', function() {
        const node = newNode({
            suspended: true
        });
        assert(node.status().text.indexOf('Scheduling suspended') === 0);
    });
    it('should suspend if all weekdays are unticked and disabled', function() {
        const config = _.zipObject(
            ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
            _.times(7, () => false)
        );
        const node = newNode(config);
        assert(node.status().text.indexOf('Scheduling suspended') === 0);
    });
    it('should suspend programmatically', function() {
        let node = newNode();
        node.emit('input', {
            payload: {
                suspended: true
            }
        });
        assert(node.status().text.indexOf('Scheduling suspended') === 0);

        node = newNode();
        node.emit('input', {
            payload: 'suspended true'
        });
        assert(node.status().text.indexOf('Scheduling suspended') === 0);
    });
    it('should handle day configuration', function() {
        const now = moment();
        // Start by disabling today in the configuration.
        const config = _.zipObject(
            ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
            _.times(7, index => now.isoWeekday() !== index + 1)
        );
        /*
         * Make sure we schedule 'on' for today by making the time after now. That way, disabling
         * today in the config will force the 'on' to be tomorrow and we can assert it.
         */
        config.ontime = moment()
            .add(1, 'minute')
            .format('HH:mm');
        const node = newNode(config);
        assert.strictEqual(
            node.eztimerEvents().on.moment.isoWeekday(),
            now.add(1, 'day').isoWeekday()
        );
    });
    it('should emit the correct info', function() {
        let ontime = moment()
            .seconds(0)
            .add(1, 'minute');
        const offtime = moment()
            .seconds(0)
            .add(2, 'minute');

        const node = newNode({
            ontime: ontime.format('HH:mm'),
            offtime: offtime.format('HH:mm'),
            onoffset: '',
            offoffset: '',
            onpayload: 'onpayload',
            ontopic: 'ontopic',
            offpayload: 'offpayload',
            offtopic: 'offtopic'
        });

        node.emit('input', {
            payload: 'info'
        });
        assert.deepStrictEqual(node.sent(0), {
            payload: {
                on: ontime.toDate().toUTCString(),
                off: offtime.toDate().toUTCString(),
                state: 'off',
                onpayload: 'onpayload',
                ontopic: 'ontopic',
                offpayload: 'offpayload',
                offtopic: 'offtopic'
            },
            topic: 'info'
        });

        node.emit('input', {
            payload: 'suspended true'
        });

        node.emit('input', {
            payload: 'info'
        });
        assert.deepStrictEqual(node.sent(1), {
            payload: {
                on: 'suspended',
                off: 'suspended',
                state: 'suspended',
                onpayload: 'onpayload',
                ontopic: 'ontopic',
                offpayload: 'offpayload',
                offtopic: 'offtopic'
            },
            topic: 'info'
        });

        ontime = ontime.subtract(3, 'minute').add(1, 'day');
        node.emit('input', {
            payload: {
                suspended: false,
                ontime: ontime.format('HH:mm'),
                ontopic: 'ontopic1',
                offpayload: 'offpayload1'
            }
        });

        node.emit('input', {
            payload: 'info'
        });
        assert.deepStrictEqual(node.sent(2), {
            payload: {
                on: ontime.toDate().toUTCString(),
                off: offtime.toDate().toUTCString(),
                state: 'on',
                onpayload: 'onpayload',
                ontopic: 'ontopic1',
                offpayload: 'offpayload1',
                offtopic: 'offtopic'
            },
            topic: 'info'
        });
    });
    it('issue#24: should schedule correctly if on time before now but offset makes it after midnight', function() {
        const node = newNode({
            ontime: '23:45',
            onoffset: 20
        });
        const now = moment()
            .hour(23)
            .minute(46)
            .seconds(0);
        node.now = function() {
            return now.clone();
        };
        /*
         * We've overridden the now method after the initial scheduling. Cheat a bit and
         * suspend then unsuspend to force initial scheduling again and have our new now
         * method used.
         */
        node.emit('input', {
            payload: {
                suspended: true
            }
        });
        node.emit('input', {
            payload: {
                suspended: false
            }
        });
        const events = node.eztimerEvents();
        console.log(now.toString());
        console.log(events.on.moment.toString());
        const duration = Math.round(moment.duration(events.on.moment.diff(now)).asMinutes());
        console.log(duration);
        assert.strictEqual(duration, 19);
    });
    it('issue#29: should schedule correctly if on time before now but offset makes it after now', function() {
        const now = moment().seconds(0);
        console.log(`now: ${now.toString()}`);
        const ontime = now
            .clone()
            .subtract(1, 'minute')
            .format('HH:mm');
        console.log(`ontime pre offset: ${ontime.toString()}`);
        const node = newNode({
            ontime,
            onoffset: 60
        });
        const events = node.eztimerEvents();
        console.log(`ontime: ${events.on.moment.toString()}`);
        const duration = moment.duration(events.on.moment.diff(now)).asMinutes();
        console.log(duration);
        assert.strictEqual(Math.round(duration), 59);
    });
    it('should send something when triggered', function(done) {
        this.timeout(60000 * 5);
        console.log(`\t[${this.test.title}] will take 3 minutes, please wait...`);
        const ontime = moment()
            .add(1, 'minute')
            .format('HH:mm');
        const offtime = moment()
            .add(2, 'minute')
            .format('HH:mm');
        const node = newNode({
            ontime,
            offtime,
            offoffset: 0,
            offrandomoffset: '0'
        });
        setTimeout(function() {
            assert.strictEqual(node.sent(0).payload, 'on payload');
            assert.strictEqual(node.sent(0).topic, 'on topic');
            assert.strictEqual(node.sent(1).payload, 'off payload');
            assert.strictEqual(node.sent(1).topic, 'off topic');
            done();
        }, 60000 * 3);
    });
    it('should send something after programmatic configuration when triggered', function(done) {
        this.timeout(60000 * 5);
        console.log(`\t[${this.test.title}] will take 3 minutes, please wait...`);
        const ontime = moment()
            .add(1, 'minute')
            .format('HH:mm');
        const offtime = moment()
            .add(2, 'minute')
            .format('HH:mm');
        const node = newNode({
            offoffset: 0,
            offrandomoffset: '0'
        });
        node.emit('input', {
            payload: `ontime ${ontime}`
        });
        node.emit('input', {
            payload: `offtime ${offtime}`
        });
        setTimeout(function() {
            assert.strictEqual(node.sent(0).payload, 'on payload');
            assert.strictEqual(node.sent(0).topic, 'on topic');
            assert.strictEqual(node.sent(1).payload, 'off payload');
            assert.strictEqual(node.sent(1).topic, 'off topic');
            done();
        }, 60000 * 3);
    });
});

function newNode(configOverrides) {
    const config = {
        suspended: false,
        ontime: '11:45',
        ontopic: 'on topic',
        onpayload: 'on payload',
        onoffset: '',
        onrandomoffset: 0,
        offtime: 'dawn',
        offtopic: 'off topic',
        offpayload: 'off payload',
        offoffset: '5',
        offrandomoffset: 1,
        lat: 51.33411,
        lon: -0.83716,
        unittest: true,
        mon: true,
        tue: true,
        wed: true,
        thu: true,
        fri: true,
        sat: true,
        sun: true
    };
    if (configOverrides) {
        _.assign(config, configOverrides);
    }
    return mock(nodeRedModule, config);
}
