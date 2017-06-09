const NodeCache = require('node-cache')
const EventEmitter = require('events')

class Rider {
  constructor(id) {
    this.id = id
    this.nextLine = null
    this.prevLine = null
    this.lastPlayerState = null
    this.lastServerWorldTime = 0
    this.lastDistanceLine = 0
  }
}

class ZwiftLineMonitor extends EventEmitter {
  constructor (riderTimeout = 10) {
    super()
    this._lines = {}
    this._distanceLines = []
    this._riders = new NodeCache ( { stdTTL: riderTimeout, checkperiod: 60, useClones: false })
    this._riderTimeout = riderTimeout
  }

  setVerbose(state) {
    this._verbose = state
  }

  setVisibiltyBox(x, y, radius) {
    radius = Number(radius)
    this._minX = Number(x) - radius
    this._maxX = Number(x) + radius
    this._minY = Number(y) - radius
    this._maxY = Number(y) + radius
  }

  clearVisibilityBox() {
    this._minX = this._maxX = this._minY = this._maxY = null
  }

  addLine(id, name, world, roadId, roadTime) {
    if (roadTime < 2) {
      // convert fractional roadTimes to wire format (roadTime * 1000000 + 5000)
      roadTime *= 1000000
      roadTime += 5000
    }
    let line = {
      id: id,
      name: name,
      roadTime: roadTime,
      next: null,
      prev: null
    }
    if (!(world in this._lines)) {
      this._lines[world] = {}
    }
    if (!(roadId in this._lines[world])) {
      this._lines[world][roadId] = {first: null, last: null}
    }
    let current = this._lines[world][roadId].first
    while (current && current.roadTime < line.roadTime) {
      current = current.next
    }
    if (current) {
      if (current.roadTime === roadTime) {
        throw new Error(`Tried to add duplicate line ${name} at roadTime ${roadTime} - ${current.name} is already there`)
      }
      line.next = current
      line.prev = current.prev
    } else {
      line.prev = this._lines[world][roadId].last
      line.next = null
    }
    if (line.prev) {
      line.prev.next = line
    } else {
      this._lines[world][roadId].first = line
    }
    if (line.next) {
      line.next.prev = line
    } else {
      this._lines[world][roadId].last = line
    }
  }

  addDistanceMark(id, name, distance) {
    let line = {
      id: id,
      name: name,
      distance: distance,
      type: 'distance'
    }
    this._distanceLines.push(line)
  }

  findLines(world, roadId, roadTime) {
    let retval = {next: null, prev: null}

    if (world in this._lines && roadId in this._lines[world]) {
      let current = this._lines[world][roadId].first
      while (current && current.roadTime <= roadTime) {
        current = current.next
      }
      if (current) {
        retval.next = current
        retval.prev = current.prev
      } else {
        retval.next = null
        retval.prev = this._lines[world][roadId].last
      }
    }
    return retval
  }

  emitCrossing(interpolationFactor, rider, line, newPlayerState, newServerTime) {
    function interpolate (a, b) {
      return a + ((b - a) * interpolationFactor)
    }

    let crossing = {}
    const oldPlayerState = rider.lastPlayerState
    crossing.lineId = line.id
    crossing.lineName = line.name
    crossing.riderId = rider.id
    crossing.forward = oldPlayerState.isForward
    crossing.serverWorldTime = interpolate(rider.lastServerWorldTime.toNumber(), newServerTime.toNumber())
    crossing.playerWorldTime = interpolate(oldPlayerState.worldTime.toNumber(), newPlayerState.worldTime.toNumber())
    crossing.roadPosition = interpolate(oldPlayerState.roadPosition, newPlayerState.roadPosition)
    crossing.distance = interpolate(oldPlayerState.distance, newPlayerState.distance)
    crossing.speed = interpolate(oldPlayerState.speed, newPlayerState.speed)
    crossing.cadence = Math.round(interpolate(oldPlayerState.cadence, newPlayerState.cadence))
    crossing.heartrate = Math.round(interpolate(oldPlayerState.heartrate, newPlayerState.heartrate))
    crossing.power = interpolate(oldPlayerState.power, newPlayerState.power)
    crossing.time = interpolate(oldPlayerState.time, newPlayerState.time)
    crossing.calories = interpolate(oldPlayerState.calories, newPlayerState.calories)
    crossing.climbing = interpolate(oldPlayerState.climbing, newPlayerState.climbing)
    crossing.x = interpolate(oldPlayerState.x, newPlayerState.x)
    crossing.altitude = interpolate(oldPlayerState.altitude, newPlayerState.altitude)
    crossing.y = interpolate(oldPlayerState.y, newPlayerState.y)
    crossing.groupId = oldPlayerState.groupId || newPlayerState.groupId
    crossing.sport = newPlayerState.sport
    crossing.rideOns = newPlayerState.rideOns
    crossing.laps = newPlayerState.laps
    this.emit('crossing', crossing)

  }

  generateCrossing(rider, line, newPlayerState, newServerTime) {
    const interpolationFactor = (line.roadTime - rider.lastPlayerState.roadTime) / (newPlayerState.roadTime - rider.lastPlayerState.roadTime)
    this.emitCrossing(interpolationFactor, rider, line, newPlayerState, newServerTime)
  }

  generateDistanceCrossing(rider, line, newPlayerState, newServerTime) {
    const interpolationFactor = (line.distance - rider.lastPlayerState.distance) / (newPlayerState.distance - rider.lastPlayerState.distance)
    this.emitCrossing(interpolationFactor, rider, line, newPlayerState, newServerTime)
  }

  updateRiderStatus(playerState, serverWorldTime) {
    let rider = this._riders.get(playerState.id)
    if (this._minX && ((playerState.x < this._minX) || (playerState.x > this._maxX)
      || (playerState.y < this._minY) || (playerState.y > this._maxY))) {
      if (this._verbose) {
        console.log(`Out of bounds update for rider id ${playerState.id} world ${playerState.world} road ${playerState.roadID} ${playerState.roadTime} (${playerState.x}, ${playerState.altitude}, ${playerState.y})` +
        ` boundary (${this._minX}, ${this._minY}), (${this._maxX}, ${this._maxY})`)
      }
      if (rider) {
        this._riders.del(rider.id)
      }
      return
    }
    if (this._verbose) {
      console.log(`rider in ${playerState.id} world ${playerState.world} road ${playerState.roadID} ${playerState.roadTime}`)
    }
    if (! rider) {
      rider = new Rider(playerState.id)
      this._riders.set(rider.id, rider)
    }
    //are we on a different road?
    if (rider.lastPlayerState == null || rider.lastPlayerState.roadId !== playerState.roadId ||
      (playerState.isForward && playerState.roadTime  < rider.lastPlayerState.roadTime) ||
      (!playerState.isForward && playerState.roadTime > rider.lastPlayerState.roadTime)) {
      const lines = this.findLines(playerState.world, playerState.roadID, playerState.roadTime)
      rider.nextLine = lines.next
      rider.prevLine = lines.prev
    } else if (rider.lastPlayerState.roadTime !== playerState.roadTime) {
      while (rider.nextLine && playerState.roadTime >= rider.nextLine.roadTime) {
        this.generateCrossing(rider, rider.nextLine, playerState, serverWorldTime)
        rider.prevLine = rider.nextLine
        rider.nextLine = rider.nextLine.next
      }
      while (rider.prevLine && playerState.roadTime <= rider.prevLine.roadTime) {
        this.generateCrossing(rider, rider.prevLine, playerState, serverWorldTime)
        rider.nextLine = rider.prevLine
        rider.prevLine = rider.prevLine.prev
      }
    }
    for (let l of this._distanceLines) {
      if (rider.lastPlayerState && rider.lastPlayerState.distance < l.distance && playerState.distance >= l.distance) {
        this.generateDistanceCrossing(rider, l, playerState, serverWorldTime)
      }
    }
    rider.lastPlayerState = playerState
    rider.lastServerWorldTime = serverWorldTime
    this._riders.ttl(rider.id)
  }
}

module.exports = ZwiftLineMonitor