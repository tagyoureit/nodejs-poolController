import * as React from 'react';
import { sendPackets, receivePacket } from '../Socket_Client';
import UtilitiesLayout from './UtilitiesLayout';
import
{
    Button, InputGroup, InputGroupAddon, InputGroupText, Input,
    Form, FormGroup, Label, FormText
} from 'reactstrap';
import ReactDataGrid, { GridRowsUpdatedEvent } from 'react-data-grid';

// 165,x,15,16,8,40,0,0,0,0,0,0,0,  0 ,0 ,0 ,0 ,0 ,0 ,2,190

interface State
{
    [ k: string ]: any
    rows: { [ x: number ]: number; }[]
    rowToBeAdded: string
    columns: { [ key: string ]: any }[]
}


class PacketTester extends React.Component<any, State> {
    constructor( props: State )
    {
        super( props );

        this.state = {
            rows: [],
            rowToBeAdded: '',
            columns: [ { key: `b0`, name: `No packets yet.` } ]
        }

        this.handleAdd = this.handleAdd.bind( this )
        this.handleSend = this.handleSend.bind( this )
        this.handleReceive = this.handleReceive.bind( this )
        this.handleTextInput = this.handleTextInput.bind( this )
        this.onGridRowsUpdated = this.onGridRowsUpdated.bind( this )
        this.clearQueue = this.clearQueue.bind( this )
        this.dataRowsToPackets = this.dataRowsToPackets.bind(this)
    }

    handleTextInput ( event: any )
    {
        this.setState( { rowToBeAdded: event.target.value } )
    }

    dataRowsToPackets (): number[][]
    {
        let packets: number[][] = []
        this.state.rows.forEach( ( el:number[] ) =>
        {
            //packets.push(Object.values(el))
        } ) 
        return packets;
    }

    handleSend ()
    {
        sendPackets( this.dataRowsToPackets () )
    }

    handleReceive ()
    {
        console.log( `this.dataRows:` )
        console.log(this.dataRowsToPackets())
        receivePacket( this.dataRowsToPackets() )
    }

    handleAdd ( event: any )
    {

        let _columnLength = Object.keys( this.state.columns ).length

        let rowsToAdd = this.state.rowToBeAdded.split( '\n' )

        let _arrStr: any[][] = []
        rowsToAdd.forEach( ( el: string, idx: number ) =>
        {
            _arrStr.push( el.split( ',' ).map( Number )
            )
        } )

        let _arrObj: any[] | { [ x: number ]: number; }[] | {}[] = []
        // For each parent array
        Object.keys( _arrStr ).forEach( ( _arrRow, _arrIndex ) =>
        {
            _arrObj[ _arrIndex ] = {}
            // Replace the data value with an object for parsing by react-data-grid
            _arrStr[ _arrIndex ].forEach( ( value, index ) =>
            {
                console.log( JSON.stringify( { [ `b${ index }` ]: value } ) )
                Object.assign( _arrObj[ _arrIndex ], { [ `b${ index }` ]: value } )
            } )
        } )

        //_arrObj.forEach( ( el, idx ) =>
        //{
        //    console.log( idx )
        //    console.log( el )
        //    console.log( Object.keys( _arrObj[ idx ] ).length )
        //    if ( Object.keys( _arrObj[ idx ] ).length > _columnLength )
        //    {

        //        // increase col length
        //        _columnLength = Object.keys( _arrObj[ idx ] ).length
        //    }
        //} )

        console.log( `column length: ${ _columnLength }` )


        let _newColumns = []
        // Rebuild columns each time... This could be optimized.
        for ( var i = 0; i < _columnLength; i++ )
        {
            _newColumns.push( { key: `b${ i }`, name: `b${ i }`, editable: true } )
        }

        console.log( `arr:` )
        console.log( `${ JSON.stringify( _arrObj, null, 2 ) }` )

        let newAndOldRows = this.state.rows.concat( _arrObj )
        this.setState(
            {
                rows: newAndOldRows,
                columns: _newColumns
            }
        )

    }

    clearQueue (): void
    {
        this.setState( {
            rows: [],
            columns: [ { key: `p0`, name: `No packets yet.` } ]
        } )
    }

    onGridRowsUpdated ( { fromRow, toRow, updated }: GridRowsUpdatedEvent )
    {
        this.setState( state =>
        {
            let rows = state.rows.slice();
            for ( let i = fromRow; i <= toRow; i++ )
            {
                Object.keys(updated).forEach( (key:string ) =>
                {
                    updated[key] = Number(updated[key])
                })
                rows[ i ] = { ...rows[ i ], ...updated };
            }

            return { rows: rows };
        } );
    }

    render ()
    {
        return (
            <UtilitiesLayout counter={0} >

                <Form>
                    <FormGroup>
                        <Label for="packetInput">Packet Input</Label>
                        <Input type="textarea" name="PacketInput" id="packetInput" onChange={this.handleTextInput} />
                    </FormGroup>
                </Form>
                <Button onClick={this.handleAdd} color='primary'>Add to Queue</Button>
                <Button onClick={this.clearQueue}>Clear Queue</Button>
                <p />
                <h4>Current Queue <small>(Hint: edit data table values in-line)</small></h4>
                <p />
                <ReactDataGrid
                    columns={this.state.columns}
                    rowGetter={( i: number ) => this.state.rows[ i ]}
                    rowsCount={this.state.rows.length}
                    minHeight={50*(this.state.rows.length+1)}
                    minColumnWidth={30}
                    headerRowHeight={65}
                    onGridRowsUpdated={this.onGridRowsUpdated}
                    enableCellSelect={true}
                />
                <Button onClick={this.handleSend} color='primary'>Send as outgoing packet(s)</Button>{' '}
                <Button onClick={this.handleReceive} color='primary'>Receive as incoming packet(s)</Button>
                <p />
                <h3>Directions</h3>
                For Chlorinator packets:
            <br /> The 98 (checksum) and 16,3 (end of packet) will be added by the app.
            <br /> Example: 16,2,80,0 => 16,2,80,0,98,16,3
            <p></p>
                For Intellichlor packets:
            <br /> Enter packet Dest,Src,etc. The preamble (165,xx,) and checksum will be added by the app.
            <br /> Example: 16,34,134,2,9,0 (turn off circuit 9) => 165,16,16,34,134,2,9,0,1,120
            <p></p>
                For Pump packets:
            <br /> Enter Dest, Src, etc. Preamble (165,0) and checksum will be added by the app.
            <br /> Example: 96,33,4,1,0 (turn off remote control) => 165,0,96,33,4,1,0,1,43
                        
            <p />
            <b>Note:</b> To receive incoming packets, you need to add the checksum.    
            </UtilitiesLayout>
        );
    }
}

export default PacketTester;