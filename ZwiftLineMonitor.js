const NodeCache = require('node-cache')
const EventEmitter = require('events')

class Rider {
  constructor(id) {
    this.id = id
    this.nextLine = null
    this.prevLine = null
    this.lastPlayerState = null
    this.lastServerWorldTime = 0
  }
}

class ZwiftLineMonitor extends EventEmitter {
  constructor(riderTimeout = 10) {
    super()
    this._lines = {}
    this._riders = new NodeCache ( { stdTTL: riderTimeout, checkperiod: 60, useClones: false })
    this._riderTimeout = riderTimeout
  }

  addLine(id, name, world, roadId, roadTime) {
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
      if (current.roadTime == roadTime) {
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

  generateCrossing(rider, line, newPlayerState, newServerTime) {
    const interpolationFactor = (line.roadTime - rider.lastPlayerState.roadTime) / (newPlayerState.roadTime - rider.lastPlayerState.roadTime)
    function interpolate (a, b) {
      return a + ((b - a) * interpolationFactor)
    }

    let crossing = {}
    const oldPlayerState = rider.lastPlayerState
    crossing.lineId = line.id
    crossing.lineName = line.name
    crossing.serverWorldTime = interpolate(rider.lastServerWorldTime, newServerTime)
    crossing.playerWorldTime = interpolate(oldPlayerState.worldTime, newPlayerState.worldTime)
    crossing.roadPosition = interpolate(oldPlayerState.roadPosition, newPlayerState.roadPosition)
    crossing.distance = interpolate(oldPlayerState.distance, newPlayerState.distance)
    crossing.speed = interpolate(oldPlayerState.speed, newPlayerState.speed)
    crossing.cadence = Math.round(interpolate(oldPlayerState.cadence, newPlayerState.cadence))
    crossing.heartrate = Math.round(interpolate(oldPlayerState.heartrate, newPlayerState.heartrate))
    crossing.power = interpolate(oldPlayerState.power, newPlayerState.power)
    crossing.time = interpolate(oldPlayerState.time, newPlayerState.time)
    crossing.calories = interpolate(oldPlayerState.calories, newPlayerState.calories)
    crossing.groupId = oldPlayerState.groupId || newPlayerState.groupId
    crossing.sport = newPlayerState.sport
    crossing.rideOns = newPlayerState.rideOns
    this.emit('crossing', crossing)
  }

  updateRiderStatus(playerState, serverWorldTime) {
    let rider = this._riders.get(playerState.id)
    if (! rider) {
      rider = new Rider(playerState.id)
      this._riders.set(rider.id, rider)
    }
    //are we on a different road?
    if (rider.lastPlayerState == null || rider.lastPlayerState.roadId !== playerState.roadId) {
      const lines = this.findLines(playerState.world, playerState.roadID)
      rider.nextLine = lines.next
      rider.prevLine = lines.prev
    } else if (rider.lastPlayerState.roadTime != playerState.roadTime) {
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
    rider.lastPlayerState = playerState
    rider.lastServerWorldTime = serverWorldTime
    this._riders.ttl(rider.id)
  }
}

module.exports = ZwiftLineMonitor