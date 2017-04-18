# zwift-line-monitor
A class that monitors Zwift player updates and emits events whenever riders pass a set of preconfigured lines.

This library is intended to work with the wrapped status messages from zwift-mobile-api.

#usage
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
}
```