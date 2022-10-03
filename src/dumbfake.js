function newFake() {
    var engine = {
        _midiHistory: [],
        _commands: [],
        _values: {},
        _connections: {},
        _timers: [],
    }
    engine.sendShortMsg = (a, b, c) => engine._midiHistory.push([a, b, c])
    engine.getValue = (group, key) => {
        const v = engine._values[`${group}__${key}`]
        if (typeof v !== 'number') {
            console.log(`returning NULL for unknown control ${group}/${key}`)
            return null
        }
        return v
    }
    engine.setValue = (group, key, v) => {
        engine._commands.push([group, key, v])
    }
    engine.makeConnection = (group, key, handler) => {
        const c = new Connection(engine, group, key, handler)
        const k = `${group}__${key}`
        if (!engine._connections[k]) {
            engine._connections[k] = []
        }
        engine._connections[k].push(c)
        return c
    }
    engine.colorOf = (note) => {
        for (let i = engine._midiHistory.length - 1; i >= 0; i--) {
            const [status, midino, data] = engine._midiHistory[i]
            const isNoteON = (status & 0xF0) === 0x90
            const isNoteOff = (status & 0xF0) === 0x80
            if (!isNoteON && !isNoteOff) {
                continue
            }
            if (midino === note) {
                return isNoteON ? 'red' : 'off'
            }
            if (isNoteON && midino === note + 36) {
                return 'amber'
            }
            if (isNoteON && midino === note + 72) {
                return 'green'
            }
        }
        return 'off'
    }

    engine._set = (g, k, v) => {
        const key = `${g}__${k}`
        const old = engine._values[key]
        engine._values[key] = v
        if (old !== v) {
            (engine._connections[key] || []).forEach(conn => conn.trigger())
        }
    }
    engine.processCommands = () => {
        engine._commands.forEach(([g, k, v]) => {
            switch (k) {
                case 'reloop_toggle':
                    if (v) {
                        const old = engine._values[`${g}__loop_enabled`]
                        engine._set(g, 'loop_enabled', old ? 0 : 1)
                    }
                case 'hotcue_3_activate':
                    const s = engine.getValue(g, 'hotcue_3_position')
                    const pos = s / engine.getValue(g, 'track_samples')
                    engine._set(g, 'playposition', pos)
                default:
                    engine._set(g, k, v)


            }
        })
        engine._commands = []
    }
    engine.beginTimer = (ms, f, oneShot) => {
        if (oneShot) {
            throw new Error(`cannot do one-shots`)
        }
        engine._timers.push(new Timer(f))
    }

    engine.triggerTimers = () => {
        engine._timers.forEach(t => t.func())
    }


    const deckGroups = ['[Channel1]', '[Channel2]', '[Channel3]', '[Channel4]']
    const deckKeys = ['pfl', 'play', 'play_indicator', 'volume',
        'file_bpm', 'bpm', 'track_samplerate', 'track_samples']
    const hkKeys0 = [1, 2, 3, 4].flatMap(i => [
        `hotcue_${i}_enabled`,
    ])
    const hkKyesN1 = [1, 2, 3, 4].flatMap(i => [
        `hotcue_${i + 1}_position`,
    ])
    deckGroups.forEach(group => {
        deckKeys.forEach(key => {
            engine._set(group, key, 0)
        })
        hkKeys0.forEach(key => {
            engine._set(group, key, 0)
        })
        hkKyesN1.forEach(k => engine._set(group, k, -1))
    })

    return engine
}


class Connection {
    constructor(engine, group, key, handler) {
        this.engine = engine
        this.group = group
        this.key = key
        this.handler = handler
    }
    trigger() {
        this.handler(this.engine._values[`${this.group}__${this.key}`], this.group, this.key)
    }
    disconnect() {
        this.handler = () => { }
    }
}

class Timer {
    constructor(func) {
        this.func = func
    }
}

module.exports = {
    newFake, Connection
}

