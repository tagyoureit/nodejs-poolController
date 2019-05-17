import * as React from 'react';
import { getAll, emitSocket, hidePanel } from '../Socket_Client';
import UtilitiesLayout from './UtilitiesLayout';
import PacketSniffer from './PacketSniffer'




interface State
{
    [ k: string ]: any
    packetSniffer: Search.IPacketSniffer
}

class PacketSnifferController extends React.Component<any, State> {
    constructor( props: State )
    {
        super( props );

        this.state = {
            packetSniffer: {
                dest: 15,
                src: 16,
                action: 2,
                packets: []
            }
        }
        this.handleSniff = this.handleSniff.bind( this )

        getAll( ( err: Error, d: any, which: string ) =>
        {

            // here we handle all objects which do not need to have additional configuration
            if ( which === 'searchResults' )
            {
                
                this.setState( ( prevState ) =>
                {
                    let p:Search.IPacketObj = {
                        message: d.message,
                        packet: d.packet
                    }

                    let newPackets: Search.IPacketObj[] =  prevState.packetSniffer.packets.concat( p )
                    
                    return {
                        packetSniffer: {
                            src: prevState.packetSniffer.src,
                            dest: prevState.packetSniffer.dest,
                            action: prevState.packetSniffer.action,
                            packets: newPackets
                        }
                    }
                } )
            }




        } )

    }

    handleSniff ( _dest: string, _src: string, _action: string)
    {
        console.log(`updating ${_src} ${_dest} ${_action}`)
        let res:Search.IPacketSniffer = {
           
                dest: parseInt(_dest),
                src: parseInt(_src),
                action: parseInt(_action),
                packets: []
            
        }
        this.setState( {
            packetSniffer: res
        })
    }

    clearLog (): void
    {
        this.setState( { debugText: '' } )
    }

    formatLog ( strMessage: string ): string
    {
        let strColor: string = '';
        interface LogColors
        {
            [ k: string ]: string
        }
        let logColors: LogColors = {
            error: "red",
            warn: "yellow",
            info: "green",
            verbose: "cyan",
            debug: "blue",
            silly: "magenta"
        };
        // Colorize Message, in HTML format
        var strSplit = strMessage.split( ' ' );
        if ( typeof ( logColors ) !== "undefined" )
            strColor = logColors[ strSplit[ 1 ].toLowerCase() ];
        else
            strColor = "lightgrey";
        if ( strColor )
        {
            strSplit[ 1 ] = strSplit[ 1 ].fontcolor( strColor ).bold();
        }

        return strSplit.join( ' ' )
    }



    render ()
    {
        return (
            <UtilitiesLayout counter={0} >
                <PacketSniffer {...this.state.packetSniffer} id='Packet Sniffer' handleSniff={this.handleSniff}/>
            </UtilitiesLayout>
            );
        }
    }
    
export default PacketSnifferController;