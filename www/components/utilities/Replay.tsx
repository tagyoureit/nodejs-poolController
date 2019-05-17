import * as React from 'react';
import { receivePacketRaw } from '../Socket_Client';
import UtilitiesLayout from './UtilitiesLayout';
import
{
    Button, InputGroup, InputGroupAddon, InputGroupText, Input,
    Form, FormGroup, Label, FormText, Row, Col
} from 'reactstrap';
import ReactDataGrid, { GridRowsUpdatedEvent, RowUpdateEvent } from 'react-data-grid';



interface State
{
    [ k: string ]: any
    replayFile?: any
    packets: IPackets[];
    numPackets: number
    columns: { [ key: string ]: any }
    selectedIndexes: number[]
    replayTimer?: NodeJS.Timeout
    runTo: number; // 
    lineToSend: number // which line/packet will be sent next
    linesSent: number // counter for sent packets
    replayButtonColor: string
    replayButtonText: string
}

type PacketType = 'packet' | 'socket' | 'api'
type DirectionType = 'inbound' | 'outbound'
interface IPackets
{
    counter: number
    type: PacketType
    direction: DirectionType
    level: string
    timestamp: string
    packet: number[]
}

class Replay extends React.Component<any, State> {
    constructor( props: State )
    {
        super( props );

        this.state = {
            numPackets: 0,
            columns: [ { key: `counter`, name: `#`, width: 80 },
            { key: 'type', name: 'Type', width: 75 },
            { key: `direction`, name: `Direction`, width: 90 },
            { key: `level`, name: `Level`, width: 60 },
            { key: 'timestamp', name: 'H:M:S.s', width: 110, formatter: this.dateFormatter },
            { key: 'packet', name: 'Packet', formatter: this.packetFormatter }
            ],
            packets: [],
            selectedIndexes: [],
            runTo: 0,
            lineToSend: 0,
            linesSent: 0,
            replayButtonColor: 'primary',
            replayButtonText: 'Replay'
        }

        this.handleFile = this.handleFile.bind( this )
        this.dateFormatter = this.dateFormatter.bind( this )
        this.onRowsSelected = this.onRowsSelected.bind( this )
        this.runToThisLine = this.runToThisLine.bind( this )
        this.handleReset = this.handleReset.bind( this )
        this.handleReplayButton = this.handleReplayButton.bind( this )
        this.replayFile = this.replayFile.bind( this )
        this.resetIntervalTimer = this.resetIntervalTimer.bind( this )
    }

    dateFormatter = ( ( { value }: { value: string } ) =>
    {
        let date = new Date( value )
        return `${ date.getHours() }:${ date.getMinutes() }:${ date.getSeconds() }.${ date.getMilliseconds() }`
    } )

    packetFormatter = ( ( { value }: { value: string[] } ) =>
    {
        return value.join( ',' )
    } )

    onRowsSelected = ( rows: RowUpdateEvent[] ) =>
    {
        console.log( `pressed row(+1) ${ rows[ 0 ].rowIdx + 1 }` )
        this.setState( { runTo: rows[ 0 ].rowIdx + 1 } )
        this.runToThisLine( rows[ 0 ].rowIdx + 1 )
    };

    /**
     * This can be triggered by the Choose File input button in 
     * which case the param will be passed.  Or it will be called
     * by reset in which case we load the file from this.state.replayFile
     * @param event file that will be uploaded
     */
    handleFile ( event?: any )
    {
        const reader = new FileReader()

        let files = event === undefined ? this.state.replayFile : event.currentTarget.files;
        // check to make sure reset button wasn't clicked before loading a file

        if ( files.length > 0 )
        {
            let _file = files[ 0 ]
            // store file for reloading during reset
            this.setState( { replayFile: [ _file ] } )
            reader.readAsText( _file )
        }

        reader.onload = ( event: any ) =>
        {
            const file: any = event.target.result;
            let rawLines: string[] = file.split( /\r\n|\n/ );
            let allLines: IPackets[] = [];

            // Reading line by line
            rawLines.forEach( ( _line ) =>
            {
                if ( _line.length > 10 )
                {
                    let line: IPackets = JSON.parse( _line )
                    if ( line.type === 'packet' && line.direction === 'inbound' )
                    {
                        allLines.push( line )
                    }
                }
            } );

            let totalPackets: number = 0;
            allLines.forEach( ( line: any ) =>
            {
                totalPackets++
                Object.assign( line, { counter: totalPackets } );

            } )

            this.setState( {
                packets: allLines,
                numPackets: Object.keys( allLines ).length
            } )
        }

    }

    handleReset ()
    {
        this.setState( {
            runTo: 0,
            linesSent: 0,  // counter for sent packets
            lineToSend: 0,  // which line/packet will be sent next
            numPackets: 0,
            packets: [],
            selectedIndexes: []
        } )

        this.resetIntervalTimer()
        this.handleFile()
    }

    resetIntervalTimer ()
    {
        this.setState( {
            replayButtonColor: 'primary',
            replayButtonText: 'Replay'
        } )
        clearTimeout( this.state.replayTimer )
    }

    componentWillUnmount ()
    {
        this.handleReset()
    }

    runToThisLine ( runTo: number )
    {
        if ( this.state.replayTimer !== null )
        {
            clearTimeout( this.state.replayTimer )
        }
        let packetPackage: number[][] = []
        console.log( `this.state.lineToSend: ${ this.state.lineToSend }  runTo:  ${ runTo }` )

        let _lineToSend = this.state.lineToSend
        let _linesSentArr: number[] = []
        for ( _lineToSend; _lineToSend < runTo; _lineToSend++ )
        {


            if ( _lineToSend <= this.state.numPackets )
            {
                packetPackage.push( this.state.packets[ _lineToSend ].packet )
            }
            // set checkbox for selected items
            _linesSentArr = _linesSentArr.concat( _lineToSend )
        }

        this.setState( {
            selectedIndexes: this.state.selectedIndexes.concat(
                _linesSentArr
            ),
            lineToSend: _lineToSend
        } );

        receivePacketRaw( packetPackage )
        console.log( 'sending up to #%s %s', _lineToSend, packetPackage.toString() )
        // $( '#packetCount' ).val( this.state.lineToSend + " of " + totalPackets )
    }

    handleReplayButton ()
    {
        if ( this.state.replayButtonText === 'Replay' )
        {
            if ( this.state.numPackets > 0 )
            {
                this.setState( {
                    replayButtonColor: 'success',
                    replayButtonText: 'Replaying...',
                    replayTimer: setInterval( this.replayFile, 500 )
                } )
            }
            else
            {
                console.log( 'No packets to send yet' )
            }


        }
        else
        {
            this.resetIntervalTimer()
        }
    }

    replayFile = function() 
    {
        if ( this.state.lineToSend <= this.state.numPackets )
        {
            receivePacketRaw( [ this.state.packets[ this.state.lineToSend ].packet ] )
            console.log( `sending ${ this.state.lineToSend }: ${ this.state.packets[ this.state.lineToSend ].packet.toString() }` )
            this.setState( ( state: State ) =>
            {
                return {
                    lineToSend: state.lineToSend + 1
                }
            } )
        }
        else
        {
            this.setState( {
                replayButtonColor: 'primary',
                replayButtonText: 'Replay'
            } )
            clearTimeout( this.state.replayTimer )

        }
    }

    render ()
    {
        return (
            <UtilitiesLayout counter={0} >
                <h1> Replay Packets</h1>
                <Row>
                    <Col>
                        <Form>
                            <FormGroup row>
                                <Label for="replayfile" sm={2}></Label>
                                <Col sm={10}>
                                    <Input type="file" name="replayfile" onChange={this.handleFile} />
                                    <FormText color="muted">
                                        Choose a replay .json file.
                                </FormText>
                                </Col>
                            </FormGroup>

                        </Form>
                    </Col>
                    <Col>
                        <InputGroup>
                            <InputGroupAddon addonType="prepend">Replay Packet Count</InputGroupAddon>
                            <Input value={`${ this.state.lineToSend } of ${ this.state.numPackets.toString() }`} readOnly />
                        </InputGroup>

                    </Col>
                </Row>
                <Row className='mb-2'>
                    <Button color={this.state.replayButtonColor} className='mr-1' onClick={this.handleReplayButton}>{this.state.replayButtonText}</Button>
                    <Button color='primary' onClick={this.handleReset}>Reset</Button>
                </Row>
                <Row>
                    <ReactDataGrid
                        columns={this.state.columns}
                        rowGetter={( i: number ) => this.state.packets[ i ]}
                        rowsCount={this.state.numPackets}
                        minHeight={550}
                        minColumnWidth={30}
                        headerRowHeight={65}
                        rowSelection={{
                            showCheckbox: true,
                            onRowsSelected: this.onRowsSelected,
                            selectBy: {
                                indexes: this.state.selectedIndexes
                            }
                        }}
                    />

                </Row>
                <Row>
                    Note: only inbound packets processed currently
                </Row>
            </UtilitiesLayout>
        );
    }
}

export default Replay;