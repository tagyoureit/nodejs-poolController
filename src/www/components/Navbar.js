import Link from 'next/link';
import RefreshCounter from '../components/RefreshCounter'

import {
    Collapse,
    Navbar,
    NavbarToggler,
    NavbarBrand,
    Nav,
    NavItem,
    NavLink,
    UncontrolledDropdown,
    DropdownToggle,
    DropdownMenu,
    DropdownItem
} from 'reactstrap';

class PoolNav extends React.Component {

    constructor(props) {
        super(props);

        this.toggle = this.toggle.bind(this);
        this.state = {
            isOpen: false
        };
    }
    toggle() {
        this.setState({
            isOpen: !this.state.isOpen
        });
    }
    render() {
        return (


            <div>
                <Navbar color="light" light expand="md">
                    <NavbarBrand href="/">nodejs-PoolController</NavbarBrand>
                    <RefreshCounter counter={this.props.counter}></RefreshCounter> 
                    <NavbarToggler onClick={this.toggle} />
                    <Collapse isOpen={this.state.isOpen} navbar>
                        <Nav className="ml-auto" navbar>
                        <NavItem>
                                <NavLink onClick={this.toggle} href="#SysInfo">System Info</NavLink>
                            </NavItem>
                            <NavItem>
                                <NavLink onClick={this.toggle} href="#Spa">Spa</NavLink>
                            </NavItem>
                            <NavItem>
                                <NavLink onClick={this.toggle} href="#Pool">Pool</NavLink>
                            </NavItem>
                            <NavItem>
                                <NavLink onClick={this.toggle} href="#Pumps">Pumps</NavLink>
                            </NavItem>
                            <NavItem>
                                <NavLink onClick={this.toggle} href="#Features">Features</NavLink>
                            </NavItem>
                        </Nav>
                    </Collapse>
                </Navbar>
            </div>


            /* 
            <nav id="mainnav" className="navbar navbar-light bg-light fixed-top">
                <a className="navbar-brand" href="#">Pool System</a>
                <div className="ml-auto">
                    <button className="navbar-toggler d-sm-none" type="button" data-toggle="collapse" data-target="#navbar-menu"
                            aria-controls="navbar-menu" aria-expanded="false" aria-label="Toggle navigation">
                        <span className="navbar-toggler-icon"></span>
                    </button>
            
            
                    
                   
                    
            
                </div>
                <div id="navbar-menu" className="navbar-collapse collapse">
                <ul className="navbar-nav  mr-auto mt-2 mt-lg-0">
                    <a className="nav-link" href="#systeminformation">System
                        Information</a>
                    <a className="nav-link" href="#release">Release</a>
                    <a className="nav-link" href="#pool">Pool</a>
                    <a className="nav-link" href="#spa">Spa</a>
                    <a className="nav-link" href="#chlorinator">Chlorinator</a>
                    <a className="nav-link" href="#features">Features</a>
                    <a className="nav-link" href="#pump">Pumps</a>
                    <a className="nav-link" href="#schedule">Schedules</a>
                    <a className="nav-link" href="#eggtimer">Egg Timer</a>
                    <a className="nav-link" href="#intellichem">Intellichem</a>
                    <a className="nav-link" href="#light">Lights</a>
                    <a className="nav-link" href="#debug">Debug</a>
                </ul>
                </div>
            
            
            </nav> */

        )
    }

}
export default PoolNav;