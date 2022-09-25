import { Mixxx } from "../src/mixxxbase"

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



}