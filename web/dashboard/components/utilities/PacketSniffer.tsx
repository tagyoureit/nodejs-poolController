
import CustomCard from '../CustomCard'
import * as React from 'react';
import { search, searchLoad, searchStop } from '../Socket_Client'
import
{
    InputGroup, InputGroupAddon, Input, InputGroupText, Button,
    ButtonDropdown, DropdownToggle, DropdownItem, DropdownMenu
} from 'reactstrap'
import ReactDataGrid from 'react-data-grid';
import '../../css/react-data-grid.css'
import { incoming, emitSocket, hidePanel } from '../Socket_Client';

interface Props
{
    id: string
}


interface State
{
    columns: any[]
    numColumns: number
    dest: string;
    src: string;
    action: string;
    allOrAny: 'all' | 'any'
    lastPacket: number[]
    dropdownOpen: boolean
    packets: any[]
    sniffing: boolean
}



class PacketSniffer extends React.Component<Props, State> {

    constructor( props: Props )
    {
        super( props )

        this.state = {
            numColumns: 1,
            columns: [ { key: 'waiting', name: 'Waiting for 1st message...' } ],
            dest: '15',
            src: '16',
            action: '2',
            lastPacket: [],
            dropdownOpen: false,
            allOrAny: 'all',
            packets: [],
            sniffing: false

        }


        // if ( this.state.packets.length )
        // {
        //     let numPacketRows = this.state.packets.length
        //     for ( let i = 1; i <= numPacketRows; i++ )
        //     {
        //         if ( i <= this.state.numColumns )
        //         {
        //             columns.push( { key: `${ i }`, name: `${ this.keyFetch( i, numColumns ) }` } )
        //         }
        //     }
        // }


        this.rowGetter = this.rowGetter.bind( this )
        this.keyFetch = this.keyFetch.bind( this )
        this.onDestChange = this.onDestChange.bind( this )
        this.onSrcChange = this.onSrcChange.bind( this )
        this.onActionChange = this.onActionChange.bind( this )
        this.handleSniff = this.handleSniff.bind( this )
        this.handleAllorAny = this.handleAllorAny.bind( this )
        this.toggleDropDown = this.toggleDropDown.bind( this )
        this.handleClear = this.handleClear.bind( this )
        this.stopSearching = this.stopSearching.bind( this )

        incoming( ( err: Error, d: any, which: string ) =>
        {

            // here we handle all objects which do not need to have additional configuration
            if ( which === 'searchResults' )
            {

                this.setState( ( prevState ) =>
                {
                    let p = {
                        message: d.message,
                        packet: d.packet
                    }

                    let newPackets: any[] = prevState.packets.concat( p )

                    return {
                        packets: newPackets

                    }
                } )
            }
        } )

    }

    handleClear ()
    {
        this.setState( {
            numColumns: 1,
            columns: [ { key: 'waiting', name: 'Waiting for 1st message...' } ],
            lastPacket: [],
            packets: [],
        })
    }

    handleAllorAny ( event: any )
    {
        this.setState( {
            allOrAny: event.target.value
        } )
    }

    toggleDropDown ()
    {
        this.setState( {
            dropdownOpen: !this.state.dropdownOpen
        } );
    }

    onDestChange ( event: any )
    {
        this.setState( { dest: event.target.value } )
    }
    onSrcChange ( event: any )
    {
        this.setState( { src: event.target.value } )
    }
    onActionChange ( event: any )
    {
        this.setState( { action: event.target.value } )

    }
    handleSniff ()
    {
        search( this.state.allOrAny, this.state.dest, this.state.src, this.state.action )
        this.setState({sniffing: true})
    }


    keyFetch ( key: number )
    {
        // idx will be the index of the column we are analyzing
        // last column might be 37-37=0;
        // first column might be 37-0=37 (address)


        switch ( key )
        {
            case 0:
                return `Pre (${ key })`;
                break;
            case 1:
                return `Addr (${ key })`;
                break;
            case 2:
                return `Dest (${ key })`;
                break;
            case 3:
                return `Src (${ key })`;
                break;
            case 4:
                return `Action (${ key })`;
                break;
            case 5:
                return `Len (${ key })`;
                break;
            // removed these because we may have different packet lengths
            // and therfore the chk bytes will be different for each
            // case 1:
            //     return `ChkL (${ key })`;
            //     break;
            // case 0:
            //     return `ChkH (${ key })`;
            //     break;
            default:
                return key;

        }

    }



    componentWillUpdate ( nextProps: Props, nextState: State )
    {
        // if we change the src/dest/action resubmit search.
        if ( this.state.src !== nextState.src || this.state.dest !== nextState.dest || this.state.action !== nextState.action )
        {
            // search( nextState.allOrAny, nextState.src, nextState.dest, nextState.action )

            let packetCols = [ { key: 'waiting', name: 'Waiting for 1st message...' } ]
            nextState.columns = packetCols;
        }

    }
    componentDidUpdate ( prevProps: Props, prevState: State )
    {
        // if we have new packets, update the column headers
        if ( this.state.packets.length !== prevState.packets.length && this.state.packets.length!==0)
        {
            let lastPacketNum = this.state.packets.length - 1
            // if length of last packet > # of columns then add new columns
            if ( this.state.packets[ lastPacketNum ].packet.length > Object.keys( this.state.columns ).length )
            {


                let packetCols: any //AdazzleReactDataGrid.Column<number>[];
                if ( Object.keys( this.state.columns ).length === 1 )
                {
                    packetCols = [ { key: 'message', name: 'Msg', resizable: true, width: 50 } ]
                }
                else
                {
                    // packetCols = Object.assign( {}, this.state.columns )
                    packetCols = this.state.columns.slice()
                }

                // get count of columns with the message key
                let numColumnsWithoutMsg: number = 0;
                Object.keys( packetCols ).forEach( ( el: any ) =>
                {
                    if ( packetCols[ el ].key !== 'message' )
                        numColumnsWithoutMsg += 1;
                } )

                // for each data byte >= the number of Columns we already have
                for ( let byte = 0; byte < this.state.packets[ lastPacketNum ].packet.length; byte++ )
                {
                    // if the # of bytes is less than the number of headers we already have,
                    // add the new headers
                    if ( byte >= numColumnsWithoutMsg )
                    {
                        let newCol = { key: `${ byte }`, name: `${ this.keyFetch( byte ) }`, resizable: true } 
                        packetCols.push(newCol)
                    }
                }
                this.setState( {
                    numColumns: Object.keys( packetCols ).length,
                    columns: packetCols,
                    lastPacket: ( this.state.packets.slice( -1 ) )[ 0 ].packet
                } )
            }
        }
    }

    componentWillUnmount ()
    {
    
        // if we leave the page, stop searching
        this.stopSearching()
    }
    
    stopSearching ()
    {
        searchStop()
        this.setState({sniffing: false})
    }

    rowGetter ( i: number )
    {
        if ( i >= 0 )
        {
            let dataRows = this.state.packets[ i ]
            let res: any = {
                message: this.state.packets[ i ].message
            }
            for ( let byte = 0; byte <= this.state.numColumns - 1; byte++ )
            {
                res[ byte ] = dataRows.packet[ byte ]
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
                            <Input placeholder={this.state.dest} onChange={this.onDestChange} />
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

                        <ButtonDropdown size='sm' isOpen={this.state.dropdownOpen} toggle={this.toggleDropDown} className='mr-1 mb-1 mt-1' >
                            <DropdownToggle caret color='primary'>
                                {`${ this.state.allOrAny === 'any' ? 'At least one match on any row' : 'At least one match on all rows' }`}
                            </DropdownToggle>
                            <DropdownMenu>
                                <DropdownItem value='all' onClick={this.handleAllorAny}>
                                    All

                                </DropdownItem>
                                <DropdownItem value='any' onClick={this.handleAllorAny}>
                                    Any

                                </DropdownItem>
                            </DropdownMenu>
                        </ButtonDropdown>
                        <br />
                        <Button color={this.state.sniffing?'secondary':'primary'} size="sm" onClick={this.handleSniff} className='mr-1'>Sniff</Button>
                        <Button color={this.state.sniffing?'primary':'secondary'} size="sm" onClick={this.stopSearching} className='mr-1'>Stop</Button>
                        <Button color="primary" size="sm" onClick={this.handleClear}>Clear</Button>

                    </div>

                    <div className='customDataGrid'>
                        <ReactDataGrid
                            columns={this.state.columns}
                            rowGetter={this.rowGetter}
                            rowsCount={this.state.packets.length}
                            minHeight={550}
                            minColumnWidth={30}
                            headerRowHeight={65}
                        />
                    </div>
                    <p />
                    <h5>Directions</h5>
                    Enter one or more numbers (decimal) on each line.
                    <ul>
                        <li>For wildcard matching, use *</li>
                        <li>For multiple values, use comma separated values.  Eg "2,8" in the action field will listen both for packets 2 and 8.</li>
                        <li>At least one match on <b>any</b> row will show results if they match any one criteria on any row.</li>
                        <li>At least one match on <b>all</b> rows will show results only if there is 1+ match on each line.</li>
                    </ul>
                </CustomCard>

            </div>
        );
    }
}

export default PacketSniffer;