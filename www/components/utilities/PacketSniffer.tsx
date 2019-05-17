
import CustomCard from '../CustomCard'
import * as React from 'react';
import { search, searchLoad, searchStop } from '../Socket_Client'
import { InputGroup, InputGroupAddon, Input, InputGroupText, Button } from 'reactstrap'
import ReactDataGrid from 'react-data-grid';
import '../../css/react-data-grid.css'


interface Props
{
    dest: number
    src: number
    action: number
    packets: Search.IPacketObj[]
    id: string
    handleSniff: ( _dest: string, _src: string, _action: string ) => void
}


interface State
{
    columns: any[]
    numPacketColumns: number
    dest: string;
    src: string;
    action: string;
    lastPacket: number[]
}



class PacketSniffer extends React.Component<Props, State> {

    constructor( props: Props )
    {
        super( props )
        //search( this.props.src, this.props.dest, this.props.action )


        let numPacketColumns = 1

        let packetCols = [ { key: 'waiting', name: 'Waiting for 1st message...' } ]
        if ( this.props.packets.length )
        {
            numPacketColumns = this.props.packets[ 0 ].packet.length
            for ( let i = 1; i <= numPacketColumns; i++ )
            {
                packetCols.push( { key: `${ i }`, name: `${ this.keyFetch( i, numPacketColumns ) }` } )
            }
        }

        this.state = {
            numPacketColumns: numPacketColumns,
            columns: packetCols,
            dest: this.props.dest.toString() || '15',
            src: this.props.src.toString() || '16',
            action: this.props.action.toString() || '2',
            lastPacket: []

        }
        this.rowGetter = this.rowGetter.bind( this )
        this.keyFetch = this.keyFetch.bind( this )
        this.onDestChange = this.onDestChange.bind( this )
        this.onSrcChange = this.onSrcChange.bind( this )
        this.onActionChange = this.onActionChange.bind( this )
        this._handleSniff = this._handleSniff.bind( this )
    }

    
    onDestChange ( event: any )
    {

        console.log( 'do validate' );
        console.log( `setting local state: ${ event.target.value }` )
        this.setState( { dest: event.target.value } )

    }
    onSrcChange ( event: any )
    {

        console.log( 'do validate' );
        console.log( `setting local state: ${ event.target.value }` )
        this.setState( { src: event.target.value } )

    }
    onActionChange ( event: any )
    {

        console.log( 'do validate' );
        console.log( `setting local state: ${ event.target.value }` )
        this.setState( { action: event.target.value } )

    }
    _handleSniff ()
    {
        this.props.handleSniff( this.state.dest, this.state.src, this.state.action )
    }


    keyFetch ( key: number, numPacketColumns: number )
    {
        // idx will be the index of the column we are analyzing
        // last column might be 37-37=0;
        // first column might be 37-0=37 (address)
        let idx = numPacketColumns - key;

        switch ( idx )
        {
            case numPacketColumns - 1:
                return `Pre (${ key })`;
                break;
            case numPacketColumns - 2:
                return `Addr (${ key })`;
                break;
            case numPacketColumns - 3:
                return `Dest (${ key })`;
                break;
            case numPacketColumns - 4:
                return `Src (${ key })`;
                break;
            case numPacketColumns - 5:
                return `Action (${ key })`;
                break;
            case numPacketColumns - 6:
                return `Len (${ key })`;
                break;
            case 1:
                return `ChkL (${ key })`;
                break;
            case 0:
                return `ChkH (${ key })`;
                break;
            default:
                return key;

        }

    }



    componentWillUpdate ( nextProps: Props, nextState: State )
    {
        // if we change the src/dest/action resubmit search.
        if ( this.props.src !== nextProps.src || this.props.dest !== nextProps.dest || this.props.action !== nextProps.action )
        {
            search( nextProps.src, nextProps.dest, nextProps.action )

            let packetCols = [ { key: 'waiting', name: 'Waiting for 1st message...' } ]
            nextState.columns = packetCols;
        }

    }
    componentDidUpdate ( prevProps: Props, prevState: State )
    {
        // if we have new packets, update the column headers
        if ( this.props.packets.length && prevState.numPacketColumns !== this.props.packets[ 0 ].packet.length )
        {
            
            
            let packetCols: AdazzleReactDataGrid.Column<number>[] = [ { key: 'message', name: 'Msg', resizable: true, width: 50} ]
        
            
            let numPacketColumns = 1
            numPacketColumns = this.props.packets[ 0 ].packet.length
            for ( let i = 1; i <= numPacketColumns; i++ )
            {
                packetCols.push( { key: `${ i }`, name: `${ this.keyFetch( i, numPacketColumns ) }`, resizable: true  } )
            }
    
            this.setState( () =>
            {
                return {
                    numPacketColumns: numPacketColumns,
                    columns: packetCols,
                    lastPacket: (this.props.packets.slice(-1))[0].packet
                }
            } )
        }

        

    }

    componentWillUnmount ()
    {
        // if we leave the page, stop searching
        searchStop()
    }

    rowGetter ( i: number )
    {
        //( i: number ) => this.props.packets[ i ]
        if ( i >= 0 )
        {
            let dataCols = this.props.packets[ i ].packet
            let res: any = {
                message: this.props.packets[ i ].message
            }
            for ( let j = 0; j <= this.state.numPacketColumns; j++ )
            {
                res[ j ] = dataCols[ j - 1 ]
            }

            return res
        }
    }

    render ()
    {

        return (
            <div className="tab-pane active" id="debug" role="tabpanel" aria-labelledby="debug-tab">
                <CustomCard name={this.props.id} id={this.props.id} visibility='visible'>
                    <div className='mb-5'>
                        <InputGroup>
                            <InputGroupAddon addonType="prepend">
                                <InputGroupText>Destination</InputGroupText>
                            </InputGroupAddon>
                            <Input placeholder={this.props.dest.toString()} onChange={this.onDestChange} />
                        </InputGroup>

                        <InputGroup>
                            <InputGroupAddon addonType="prepend">
                                <InputGroupText>Source</InputGroupText>
                            </InputGroupAddon>
                            <Input placeholder='16' onChange={this.onSrcChange} />
                        </InputGroup>

                        <InputGroup>
                            <InputGroupAddon addonType="prepend">
                                <InputGroupText>Action</InputGroupText>
                            </InputGroupAddon>
                            <Input placeholder='2' onChange={this.onActionChange} />
                        </InputGroup>
                        <Button color="primary" size="sm" onClick={this._handleSniff}>Sniff</Button>
                    </div>

                    <div className='customDataGrid'>
                        <ReactDataGrid
                            columns={this.state.columns}
                            rowGetter={this.rowGetter}
                            rowsCount={this.props.packets.length}
                            minHeight={550}
                            minColumnWidth={30}
                            headerRowHeight={65}
                        />
                    </div>
                </CustomCard>

            </div>
        );
    }
}

export default PacketSniffer;