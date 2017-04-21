# zwift-line-monitor
A class that monitors Zwift player updates and emits events whenever riders pass preconfigured lines.

This library is intended to work with the wrapped status messages from zwift-mobile-api.

The source of the rider status messages could be modules such as zwift-second-screen or zwift-packet-monitor.

Note that lines may be added using either a fractional roadTime or an integer value from 5000-1005000. The fractional
values are adjusted internally to the integer values by multiplying by 1000000 and adding 5000. It is assumed the
roadTime values in the rider statuses use this format of roadTimes.

## Usage
```
$>  npm install --save zwift-line-monitor
```

```javascript
const ZwiftLineMonitor = require('zwift-line-monitor');
const monitor = new ZwiftLineMonitor()

// add line: id, name, world id, road id, roadtime
monitor.addLine(5, 'Watopia Arch', 1, 0, 0.9829)

monitor.on('crossing', (crossing) => {
  console.log(crossing)
})

monitor.updateRiderStatus(state1)
monitor.updateRiderStatus(state2)
```
