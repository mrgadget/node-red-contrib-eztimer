# eztimer

Timer/scheduler for Node-RED which allows you to enter on/off times as 24hr clock (e.g. 01:10) or suncalc events (e.g.
goldenHour). It also allows you to offset times and randomise the time within the offset.

Forked from (retaining much of the code, including this document) [schedex](https://github.com/biddster/node-red-contrib-schedex) which was in turn inspired by Pete Scargill's [BigTimer](http://tech.scargill.net/big-timer/), so
hat-tip to both those coders.

Emphasis has been put on creating a simple interface and utilising built-in Node-RED formatting helpers (such as creating
a JSON payload).

# Installation
## via Node-RED GUI
Use the built-in Node-Red [Palette Manager](https://nodered.org/docs/user-guide/editor/palette/manager) to find and install.

## via NPM
In the CLI on your Node-Red box;
```sh
cd ~/.node-red
npm install node-red-contrib-eztimer
```

## Development Builds
This isn't for most people - but I've thrown this in so I don't need to keep explaining it in GitHub issues.  This assumes you have a default install of Node-RED.
```sh
cd ~
wget https://raw.githubusercontent.com/mrgadget/node-red-contrib-eztimer/develop/index.js
wget https://raw.githubusercontent.com/mrgadget/node-red-contrib-eztimer/develop/index.html
cd ~/.node-red/node_modules/node-red-contrib-eztimer
mv index.js index.js.bak
mv index.html index.html.bak
cp ~/index.js .
cp ~/index.html .
```
You will need to restart Node-RED for the change to take effect.  You can put back your old version at any time simply by copying the backup back over top.

# Configuration
## Schedule

The scheduling days allow you to choose which days of the week to schedule events. Unticking all days will suspend
scheduling.

## Suspending Scheduling (aka Manual Mode)

The **Suspend Scheduling** checkbox allows you to disable time scheduling. If scheduling is suspended, eztimer will only
generate output events upon receipt of input `on` and `off` events (see below).

This setting is provided for the situation where you temporarily don't want time based activation and don't want to
rewire your Node-RED flow.

## Times

Select the type of trigger from the dropdown and this will provide either;
* a dropdown for Sun Events, or, 
* a textbox to enter either;
    * a 24hr time, or, 
    * a duration (for the `off` event).

The below table denotes the permitted formats for Times/durations:
| input        | interpretation
|--------------|-----------------------------
| `"12:14"`    | 12 hours and 14 minutes
| `"12:14:24"` | Time of day, or 12 hours, 14 minutes and 24 seconds
| `"23h 5m"`   | 23 hours and 5 minutes
| `"5m"`       | 5 minutes
| `"90s"`      | 1 minute and 30 seconds (90 seconds)
| `300`        | 5 minutes (300 seconds) - integers are interpreted as seconds

These are valid both at UI/config-time and at runtime using payload input.

## Offsets

The on and off time can have an offset. This is specified in minutes:

* -ve number brings the time forward. E.g. if the time is dusk and offset is `-60`, a message will be generated 60 minutes
  _before_ dusk.
* +ve number _delays_ the time by the specified number of minutes.

## Randomisation of times

Both `on` and `off` times can be randomised by ticking "Use random time within offset period". For example, if you specify 
dusk with an offset of -60 minutes, every day a message will be generated at a random time in a 60 minute window before
dusk.

## Suppression of repeating events

In some circumstances it may be required to re-start the timer _without_ re-sending the `on` event - this setting achieves 
this.  It's available for both `on` and `off` events, but disabled in `trigger` mode.

## Inputs

You can wire inject nodes to the input of this node and send the following string values in `msg.payload`.

| msg.payload | Description                                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `trigger`   | Causes eztimer to emit the configured trigger event. |
| `on`        | Triggers manual on mode and causes eztimer to emit the configured `on` event. Manual mode is reset when the next `on` or `off` time is reached |
| `off`       | Triggers manual off mode and causes eztimer to emit the configured `off` event. Manual mode is reset when the next `on` or `off` time is reached |
| `info`      | Eztimer emits an object containing the `on` and `off` (or `trigger`) times in UTC format. It also contains the state which is either `on` or `off` (for on/off type). |
| `cancel`    | If the timer is currently `on`, cancels the current run (_without_ emitting an `off` event). Otherwise (or for a trigger), cancels the next scheduled `on`/trigger event and its matching `off`. A manual `on` clears a pending cancel. |
| `sync`      | Re-sends the last emitted event |

# Programmatic Control

This node supports programmatic time control as well as configuration via the NodeRED UI.

**It is very important to note that properties set programmatically in this manner are transient. They will not persist over a Node-RED restart or redeploy!**

Note that both the property-based and string-based specifications are overrides that violate the usual behavior. 
See here for further discussion https://github.com/node-red/node-red/issues/399.

You can set the following:

| Property                      | Type                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| `msg.payload.action`          | Accepts the standard input payloads of `trigger`, `on`, `off`, etc.                 |
| `msg.payload.suspended`       | Boolean: true will suspend scheduling, false will resume scheduling                 |
| `msg.payload.manual`          | Alias of `suspended`                                                                |
| `msg.payload.tag`             | String value emitted as the `tag` property for all events                           |
| `msg.payload.topic`           | String value emitted as the `topic` property for all events                         |
| `msg.payload.ontype`          | Integer value: `Sun Event [1]` & `Time of Day [2]`                                  |
| `msg.payload.ontime`          | String value representing time of day (HH:mm[:ss]), or a sun event name (e.g. `dusk`), which sets `onsun` and switches `ontype` to Sun Event unless `ontype` is also given |
| `msg.payload.onsun`           | String value: sun event name (e.g. `sunrise`, `dusk`, `goldenHour`)                 |
| `msg.payload.triggertime`     | Alias of `ontime`                                                                   |
| `msg.payload.onvalue`         | Output value for on event (must be same as configured type)                         |
| `msg.payload.triggervalue`    | Alias of `onvalue`                                                                  |
| `msg.payload.onoffset`        | Number value as specified above for Offset configuration                            |
| `msg.payload.onrandomoffset`  | Boolean value as specified above in Randomisation of Times                          |
| `msg.payload.offtype`         | Integer value: `Sun Event [1]`, `Time of Day [2]` & `Duration [3]`                  |
| `msg.payload.offtime`         | String value representing time of day (HH:mm[:ss]), or a sun event name (as `ontime`) |
| `msg.payload.offsun`          | String value: sun event name (e.g. `sunset`, `night`)                               |
| `msg.payload.duration`        | String value representing a timespan (see [Times](##Times))                         |
| `msg.payload.offvalue`        | Output value for off event (must be same as configured type)                        |
| `msg.payload.offoffset`       | Number value as specified above for Offset configuration                            |
| `msg.payload.offrandomoffset` | Boolean value as specified above in Randomisation of Times                          |
| `msg.payload.mon`             | Boolean: true enables the schedule on a Monday, false disables it.                  |
| `msg.payload.tue`             | Boolean: true enables the schedule on a Tuesday, false disables it.                 |
| `msg.payload.wed`             | Boolean: true enables the schedule on a Wednesday, false disables it.               |
| `msg.payload.thu`             | Boolean: true enables the schedule on a Thursday, false disables it.                |
| `msg.payload.fri`             | Boolean: true enables the schedule on a Friday, false disables it.                  |
| `msg.payload.sat`             | Boolean: true enables the schedule on a Saturday, false disables it.                |
| `msg.payload.sun`             | Boolean: true enables the schedule on a Sunday, false disables it.                  |

# Change Log
## 1.2.7
* Fixed HA zones when Node-RED is running as an HA addon using 'ingress' (web root path issue).
* Enabled HA zones to work with multiple servers.  [credit @zachowj](https://github.com/mrgadget/node-red-contrib-eztimer/issues/39)
* Fixed spurious log message saying event was sent when it wasn't (when repeat event suppression was enabled).
* Completed implementation of `topic` and exposed to UI. [credit @ChristianMayer](https://github.com/mrgadget/node-red-contrib-eztimer/issues/43)
* Input messages are stored and payload is transmitted as `_payload` property for subsequent events. [credit @ChristianMayer](https://github.com/mrgadget/node-red-contrib-eztimer/pull/45)

## 1.2.6
* Fixed `cancel` action so that it correctly cancels the current timer run, and re-schedules the next `on` event. [credit @wokkeltje13](https://github.com/mrgadget/node-red-contrib-eztimer/issues/42)

## 1.2.5
* Added `resend` feature.  Enabling this causese the last scheduled event to be re-emitted at the pre-defined interval. [credit @JasonSwindle](https://github.com/mrgadget/node-red-contrib-eztimer/issues/37)
* Included `action` in programmatic control - this enablings the sending of on/off events from a JSON input. [credit @petter-b](https://github.com/mrgadget/node-red-contrib-eztimer/issues/38)
* Hooked into HomeAssistant (where available) for latitude and longitude. [credit @mingan666](https://github.com/mrgadget/node-red-contrib-eztimer/issues/39)
* Added `offtype` and `ontype` programmables.  Used for dynamically changing the event type - these changes are _not_ saved (ie, they won't survive a Node-RED restart), and input is _not_ validated, so use with caution. Required integer values are in the [Programmatic Control](##Programmatic-Control) table. [credit @matt6575](https://github.com/mrgadget/node-red-contrib-eztimer/issues/40)
* Added `manual` as an alias for `suspended` as it makes more sense with how some users use the node. [credit @matt6575](https://github.com/mrgadget/node-red-contrib-eztimer/issues/40)
* Fixed anomolous error upon input message. [credit @marc-gist](https://github.com/mrgadget/node-red-contrib-eztimer/issues/41)

## 1.2.4
* Change `info` to be sent with every output (under the `msg.info`). [credit @Fires04](https://github.com/mrgadget/node-red-contrib-eztimer/issues/30). 
* Updated on/off/trigger `nextEvent` property `info` to be Date object (rather than a string) - enabling easier programmatic usage (for example `.getDate()` for unix timestamp). This can be turned back in to a string if required using the `.toString()` method.  This property _may_ still be a string however, for example, if it is `suspended` or `manual`.
* Improved error when a `null` or `undefined` msg.payload is sent to the node.

## 1.2.3
* Fixed `number` output - added `parseFloat()` to ensure output is a number (rather than a string representation of a number). [credit @bemmbix](https://github.com/mrgadget/node-red-contrib-eztimer/issues/28). 

## 1.2.2
* Fixed `scheduling suspended` node status text.

## 1.2.1
* Fixed emitting of `flow` and `global` context values (node wouldn't pick them up as values previously)
* Fixed assignment of `flow` and `global` context values to store correct type. [credit @LorenzKahl](https://github.com/mrgadget/node-red-contrib-eztimer/issues/24).
* Renamed `Input Trigger` off-type to `Manual` to align with the on-type of the same name.
* Fixed status reports for `Manual` off time. [credit @moryoav](https://github.com/mrgadget/node-red-contrib-eztimer/issues/25).
* Permit blank on time - allows for full programmatic usage without errors being displayed. [credit @moryoav](https://github.com/mrgadget/node-red-contrib-eztimer/issues/25).
* Simplified node status, removed auto/manual concept (inherited from parent, didn't really make any sense with the way the node works now).

## 1.1.7
* Fixed `cancel` to actually work - the node no longer emits the `off` event after a `cancel` call.  [credit @svwhisper](https://github.com/mrgadget/node-red-contrib-eztimer/issues/23).
* Added code to support `flow` and `global` contexts as assignment properties.  When selected, these do not emit flow message.  [credit @LorenzKahl](https://github.com/mrgadget/node-red-contrib-eztimer/issues/22).

## 1.1.6
Fixes driven by issue #21 [credit @jazzgil](https://github.com/mrgadget/node-red-contrib-eztimer/issues/21).
* Fixed the Node-RED info pane to correctly match the the programmatic options in this file (see [Programmatic Control](#Programmatic-Control)) 
* Updated output function to correctly emit programatically set topic (`ontopic` or `offtopic`) - not previously sent.
* Added ability to set `tag` value programmatically.
 
## 1.1.5
* Fixed some bugs introduced in the `info` message (displaying `on` and `off` values) [credit @Export33](https://github.com/mrgadget/node-red-contrib-eztimer/issues/18).

## 1.1.4
* Added some rudimentary validation to lat/long and made the fields only visible when required (as suggested in [issue #15](https://github.com/mrgadget/node-red-contrib-eztimer/issues/13) by jhelmink).

## 1.1.3
* Modified `info` output be more informative and logical.  Fixed issue where `info` wouldn't work for `trigger` timer type. [credit @marc-gist](https://github.com/mrgadget/node-red-contrib-eztimer/issues/14).

## 1.1.2
* Fixed bug introduced in 1.1.0 where some inputs arguments ceased to function correctly. [credit @marc-gist](https://github.com/mrgadget/node-red-contrib-eztimer/issues/13).

## 1.1.1
* Fixed `timestamp` value type (previously emitted a blank value) so it outputs milliseconds since epoch - the same as the built-in _input_ node. [credit @marc-gist](https://github.com/mrgadget/node-red-contrib-eztimer/issues/12).
 
## 1.1.0
A few changes in this one - have had it running in test for a month or two and believe it to be stable - as always, log any bugs at [github issues](https://github.com/mrgadget/node-red-contrib-eztimer/issues) and I'll tend to them as soon as possible.
* Added ability to change duration without resetting timer (enabling duration change while timer is on)
* Made duration more 'friendly' - 00:00, 00:00:00, 34m, 23s, 34m 4s, and even a plain integer (interpreted as seconds) are all valid for duration now.
* Added ability to _Suppress Repeated Events_. Meaning once an `on` event has been sent, repeatedly sending `on` inputs won't resend the `on` event (but it will restart the timer)
* Added `cancel` as input command (to cancel any existing timer run without emitting `off` event).
* Added `tag` config parameter.  This value is emitted with all events to allow easy identification of specific eztimer node the message was emitted from. Defaults to `eztimer`.
* Fixed issue where, when 1) using a duration event type _with_ 2) some days disabled _and_ 3) the timer is run manually on a disabled day, the `off` event would schedule on the next _available_ day (causing an abnormally long runtime).

## 1.0.14
* Added `nadir` to ordered sun event array

## 1.0.13
* Corrected invalid time received SunCalc based on events that don't happen at a particular lat/long by moving to the next closest valid event.  ie, if `night` was chosen, but doesn't exist, `nauticalDusk` would be used.  A warning is emitted each time an event is scheduled for a sun event different to that selected in the config. - [credit @B0F1B0](https://github.com/mrgadget/node-red-contrib-eztimer/issues/10).

## 1.0.12
* Error gracefully when sun events don't happen at particular lat/long (due to polar nights/days) - [credit @B0F1B0](https://github.com/mrgadget/node-red-contrib-eztimer/issues/9).

## 1.0.11
* Fixed programmatic alteration of day-of-week flag - [credit @stu-carter](https://github.com/mrgadget/node-red-contrib-eztimer/issues/8).

## 1.0.10
* Fixed bug where a manual `on` event (with a duration-based `off` event) wasn't scheduling it's `off` event.
* Enabled the use of seconds for time-based events (was documented but always reverted to 0).
* Added [missing] input parameter `payload.duration` to allow prgrammatic adjustment of the duration.
* Adjusted default value for `duration` to 00:01:00 (1 minute) - was 0, which broke the node.
* Fixed re-schedule after manual `off` event.
* Fixed state reporting in `info` output payload.
* Added node name to `info` output.  If no name is set, `eztimer` is returned.

Thanks to @stu-carter for detailed reports enabling the above fixes ([related issue](https://github.com/mrgadget/node-red-contrib-eztimer/issues/6)).

## 1.0.9
* Fixed `manual` variable being used before declaration - credit @marc-gist.
* Added UI tip for times and duration to make the HH:mm:ss requirement clearer - credit @stu-carter.

## 1.0.8
* Fixed next event status text for trigger.

## 1.0.7
* Corrected commands to set output value for on/off events - `onvalue` and `offvalue` are more correct, as it's not necessarily the payload you're updating. 
* Added `triggervalue` as an alias to `onvalue`.
* Values must match the configured value type.
* Removed the string command examples as they don't function correctly - the payload must be a JSON object to update a property value.

## 1.0.6
* Enabled startup events for `trigger`, configured off by default.  Caution required due to this being on by default for exisitng nodes.
* Fixed boolean data type to correctly output boolean rather than a string representation - credit @marc-gist.

## 1.0.5
* Fix `ontime` and `offtime` inputs, added `triggertime` as an alias of `ontime`.
