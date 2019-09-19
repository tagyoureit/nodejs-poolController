
import UtilitiesNavbar from '../utilities/UtilitiesNavbar';
import
{
    Container,
    Collapse,
    Navbar,
    NavbarToggler,
    NavbarBrand,
    Nav,
    NavItem,
    NavLink} from 'reactstrap'
import * as React from 'react';

const NavMenu = () =>
{
    return ( <Nav className="ml-auto" >
        <NavItem>
            <NavLink href="/" id='poolController' >nodejs-PoolController</NavLink>
        </NavItem>
        <NavItem>
            <NavLink  href="/packetSniffer">
                Packet Sniffer
        </NavLink>
        </NavItem>
        <NavItem>
            <NavLink href="/packetTester">
                Packet Tester
        </NavLink>
        </NavItem>
        <NavItem>
            <NavLink href="/replay">
                Replay Packets
        </NavLink>
        </NavItem>
    </Nav> )
}

const UtilitiesLayout = ( props: any ) => (
    
    <div>
        <UtilitiesNavbar />
        <Container>

            <div className="tab-content">
                {props.children===undefined?NavMenu():props.children}
                
            </div>

        </Container>

    </div>

)

export default UtilitiesLayout;