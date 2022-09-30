const fs = require('fs')
const { newK2 } = require('./dumb')
const { newFake } = require('./dumbfake')

const fm = newFake()
const k2 = newK2(fm, fm)
const pairs = k2.midiPairs



const controls = pairs.map(mp => `<control>
    <key>K24D.state.dispatch.${mp.toString()}</key>
    <status>${mp.status}</status>
    <midino>${mp.midino}</midino>
    <options><Script-Binding/></options>
    </control>`)
const header = `<?xml version='1.0' encoding='utf-8'?>`
const info = `<info>
        <name>Xone 3D switcher</name>
        <author>PtaQ</author>
        <description>3-deck controller with overview layer</description>
    </info>
    `
const xml = `${header}
        <MixxxControllerPreset mixxxVersion="2.1" schemaVersion="1">
        ${info}
        <controller id="XONE:K2">
        <scriptfiles>
            <file filename="xone-3d.js" functionprefix="K24D" />
        </scriptfiles>
        <controls>
${controls.join('\n')}
</controls>
</controller>
</MixxxControllerPreset>
`

fs.writeFile('out/xone-3d.midi.xml', xml, function (err, data) {
    if (err) {
        return console.error(err)
    }
})