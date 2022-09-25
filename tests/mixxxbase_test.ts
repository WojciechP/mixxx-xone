
import * as pqmx from '../src/mixxxbase'
import { FakeMixxx } from './fakemixxx'


let fm: FakeMixxx
beforeEach(() => {
    fm = new FakeMixxx()
    pqmx.injectMixx(fm)
})

describe('deck', () => {
    const d = new pqmx.Deck('[Channel2]')
    it('sets volume', () => {
        d.control('volume').setValue(0.4)
        expect(fm.getValue('[Channel2]', 'volume')).toBe(0.4)
    })
    it('reacts to changes', () => {
        const l = {
            onControlChange: (v: number) => {
                if (v < 0.5) {
                    d.control('volume').setValue(0.8)
                }
            }
        }
        d.control('volume').addListener(l)
        fm.setValue('[Channel2]', 'volume', 0.2)
        expect(fm.getValue('[Channel2]', 'volume')).toBe(0.8)
    })
})

