import { MappingDesc } from "./genxml"
import { Control, Deck, Layers, Layer, MidiHandlerMap, registerMapping } from "./mixxxbase"
import { EndlessHandlers, registerMIDI } from "./xone"


registerMapping({
    name: "Xone:k2 switching",
    description: "4-decks switchable mapping",
    controllerID: "XONE:K2",
    functionprefix: "XoneK2_4D",
},
    layers => {
        const midimap = registerMIDI()
        const decks = [
            new Deck('[Channel3]'),
            new Deck('[Channel1]'),
            new Deck('[Channel2]'),
            new Deck('[Channel4]'),
        ]

        const main = layers.main
        midimap.eqCols.forEach((col, colNum) => {
            const d = decks[colNum]
            // TODO: col[0] quick filter
            main.map(col[1], {
                turn: (val) => d.control('filterHigh').setValue(val / 65),
                down: () => d.control('play').toggle(),
            }, d.control('play_indicator'), v => col[1].setColor(v ? Color.RED : Color.OFF))

            col[1].turn.setOnTurn(val => {
                d.control('filterHigh').setValue(val / 64)
            })
            col[1].push.setOnDown(() => {
                d.control('play').toggle()
            })
            col[1].push.color = col[1].push.red
            d.control('play_indicator').addListener(col[1].push)


            col[2].turn.setOnTurn(val => {
                d.control('filterMid').setValue(val / 64)
            })
            col[2].push.setOnDown(() => {
                print('sync') // tempo robot
            })
            col[2].push.color = col[2].push.amber
            d.control('sync_enabled').addListener(col[2].push)

            col[3].turn.setOnTurn(val => {
                d.control('filterLow').setValue(val / 64)
            })
            col[3].push.setOnDown(() => {
                // TODO: switch deck
                d.control('pfl').toggle()
            })
            col[3].push.color = col[3].push.green
            d.control('pfl').addListener(col[3].push)

        })
        midimap.letters.d.setOnDown(() => print('foo'))
    })

