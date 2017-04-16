const test = require ('tape')

const ZwiftLineMonitor = require('../ZwiftLineMonitor')

let zlm = null

test('constructor', (t) => {
  t.doesNotThrow(() => {
    zlm = new ZwiftLineMonitor(0)
  })
  t.end()
})

test('add some lines', (t) => {
  t.doesNotThrow(() => {
    zlm.addLine(1, 'line 1', 1, 1, .1)
    zlm.addLine(2, 'line 2', 1, 1, .2)
    zlm.addLine(3, 'line 3', 1, 1, .3)
  })
  t.end()
})

let playerState = {
  id: 1,
  worldTime: 2,
  world: 1,
  roadID: 1,
  roadTime: 0.05,
  cadenceUHz: Math.round((90 / 60) * 1000000),
  power: 200,
  heartrate: 140,
  distance: 1000,
  speed: 44000000,
  roadPosition: 10000000,
  time: 100,
  calories: 230,
  groupId: 0,
  sport: 0,
}

test('generate line crossing', (t) => {
  let crossingHandled = false
  function handleCrossing(crossing) {
    crossingHandled = true
    t.equal(crossing.lineId, 1, 'line id')
    t.equal(crossing.lineName, 'line 1', 'line name')
    t.equal(crossing.playerWorldTime, 3, 'world time')
    t.equal(crossing.serverWorldTime, 103, 'world time')
    t.equal(crossing.heartrate, 141, 'heartrate')
    t.equal(crossing.distance, 1001, 'distance')
    t.equal(crossing.speed, 44000001, 'speed')
    t.equal(crossing.time, 101, 'time')
    t.equal(crossing.calories, 231, 'calories')
    t.equal(crossing.groupId, 0, 'group ID')
    t.equal(crossing.sport, 0, 'sport')
  }
  t.doesNotThrow(() => {
    zlm.updateRiderStatus(playerState, 102)
  }, 'initial rider state')
  t.doesNotThrow(() => {
    zlm.on('crossing', handleCrossing)
  }, 'register crossing listener')
  playerState = Object.assign({}, playerState)
  playerState.worldTime += 2
  playerState.roadTime = 0.15
  playerState.heartrate += 2
  playerState.cadence += 2
  playerState.distance += 2
  playerState.speed += 2
  playerState.time += 2
  playerState.calories += 2
  t.doesNotThrow(() => {
    zlm.updateRiderStatus(playerState, 104)
  }, 'updated rider state')
  t.equal(crossingHandled, true, 'line crossing')
  zlm.removeListener('crossing', handleCrossing)
  t.end()
})

test('second line crossing', (t) => {
  let crossings = 0
  function handleCrossing(crossing) {
    console.log(JSON.stringify(crossing, null, '  '))
    crossings++
  }
  zlm.on('crossing', handleCrossing)
  playerState = Object.assign({}, playerState)
  playerState.worldTime += 2
  playerState.roadTime = .35
  t.doesNotThrow(() => {
    zlm.updateRiderStatus(playerState, 106)
  }, 'move past two lines')
  t.equal(crossings, 2, 'two crossings generated')
  zlm.removeListener('crossing', handleCrossing)
  t.end()
})