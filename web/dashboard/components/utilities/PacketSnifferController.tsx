import * as React from 'react';

import UtilitiesLayout from './UtilitiesLayout';
import PacketSniffer from './PacketSniffer'




interface State
{
  
}

class PacketSnifferController extends React.Component<any, State> {
    constructor( props: State )
    {
        super( props );

        
        

    }






    render ()
    {
        return (
            <UtilitiesLayout counter={0} >
                <PacketSniffer  id='Packet Sniffer' />
            </UtilitiesLayout>
        );
    }
}

export default PacketSnifferController;