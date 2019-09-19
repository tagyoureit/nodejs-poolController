import StatusIndicator from '../StatusIndicator'
import * as React from 'react';

import
{
    Collapse,
    Navbar,
    NavbarToggler,
    NavbarBrand,
    Nav,
    NavItem,
    NavLink
} from 'reactstrap';

interface Props
{

}

class UtilitiesNav extends React.Component<Props, any> {

    constructor( props: Props )
    {
        super( props );

        this.toggle = this.toggle.bind( this );
        this.state = {
            isOpen: false
        };

    }
    toggle ()
    {
        this.setState( {
            isOpen: !this.state.isOpen
        } );
    }

    render ()
    {
        return (
            <Navbar color="light" light sticky="top" >
                <NavbarBrand href="/" >nodejs-PoolController Utilities


                </NavbarBrand>



                <NavbarToggler onClick={this.toggle} />
                <Collapse isOpen={this.state.isOpen} navbar>
                    <Nav className="ml-auto" >
                        <NavItem>
                            <NavLink onClick={this.toggle} href="/" id='poolController' >nodejs-PoolController</NavLink>
                        </NavItem>
                        <NavItem>
                            <NavLink onClick={this.toggle} href="/packetSniffer">
                                Packet Sniffer
                                </NavLink>
                        </NavItem>
                        <NavItem>
                            <NavLink onClick={this.toggle} href="/packetTester">
                                Packet Tester
                                </NavLink>
                        </NavItem>
                        <NavItem>
                            <NavLink onClick={this.toggle} href="/replay">
                                Replay Packets
                                </NavLink>
                        </NavItem>
                    </Nav>
                </Collapse>

            </Navbar>
        )
    }
}
export default UtilitiesNav;