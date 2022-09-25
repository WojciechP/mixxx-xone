import { MidiHandlerMap, MidiSpec, Mixxx } from "../src/mixxxbase"
import * as xml2js from 'xml2js'

interface LocalConn {
    group: string
    key: string
    f: (val: number) => void
}

export class FakeMixxx implements Mixxx {
    public state: { [key: string]: number } = {}
    public conns: { [id: number]: LocalConn } = {}
    private nextID = 1;

    getValue<Key extends DeckControlKey>(group: GroupControlMap[Key], key: Key): number {
        return this.state[`${group}:${key}`]
    }
    setValue<Key extends DeckControlKey>(group: GroupControlMap[Key], key: Key, v: number): void {
        this.state[`${group}:${key}`] = v
        Object.values(this.conns).forEach(conn => {
            if (conn.group == group && conn.key === key) {
                conn.f(v)
            }
        })
    }
    makeConnection<Key extends DeckControlKey>(group: GroupControlMap[Key], key: Key, h: (val: number) => void): number {
        this.conns[this.nextID] = {
            group,
            key,
            f: h,
        }
        return this.nextID++
    }
    trigger<Key extends DeckControlKey>(group: GroupControlMap[Key], key: Key): void {
        const v = this.getValue(group, key)
        Object.values(this.conns).forEach(conn => {
            if (conn.group == group && conn.key === key) {
                conn.f(v)
            }
        })
    }

    sendShortMsg(ch: number, ctrl: number, val: number): void {
        throw new Error("Method not implemented.")
    }
    private xmlControls: MidiSpec[]
    private mhm: MidiHandlerMap // for dispatching MIDI signals

    public async injectXML(xml: string, fpref: string, mhm: MidiHandlerMap) {
        this.mhm = mhm
        const parser = new xml2js.Parser()
        const parsed = await parser.parseStringPromise(xml)
        const controls = parsed['MixxxControllerPreset']['controller'][0]['controls'][0]['control']
        this.xmlControls = controls.map((xml: any) => {
            const c = xml
            return {
                status: parseInt(c.status),
                midino: parseInt(c.midino),
                key: c.key,
            }
        })

    }
    public dispatchMidi(status: number, midino: number, val: number): void {
        let n = 0
        this.xmlControls.forEach((ctrl) => {
            if (ctrl['status'] === status && ctrl['midino'] === midino) {
                n++
                const fname = ctrl.key
                const [pref, suf] = String(fname).split('.')
                if (pref != 'handlers') {
                    throw `bad key ${fname}`
                }
                const f: (v: number) => void = (this.mhm as any).handlers[suf]
                f(val)
            }
        })
        if (n === 0) {
            throw `no handler for 0x${status.toString(16)}/0x${midino.toString(16)}`
        }
    }

}