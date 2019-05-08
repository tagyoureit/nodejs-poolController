import RefreshCounter from './RefreshCounter'
import * as React from 'react';
import { resetPanels, updateVersionNotification, hidePanel } from './Socket_Client';
import
{
    Collapse,
    Navbar,
    NavbarToggler,
    NavbarBrand,
    Nav,
    NavItem,
    NavLink,
    Button,
    Tooltip
} from 'reactstrap';
import { S_IFREG } from 'constants';
interface Props
{
    updateStatus: IUpdateAvailable.Ijsons
    updateStatusVisibility: string
}
interface State
{
    gitStateColor: string,
    result: string,
    tooltipOpen: boolean,
    tooltipText: string,
}

class Footer extends React.Component<Props, State> {

    constructor( props: Props )
    {
        super( props );
        this.state = {
            gitStateColor: 'secondary',
            result: '...',
            tooltipOpen: false,
            tooltipText: 'Version not received yet.'
        }
        this.toggle = this.toggle.bind( this );
        this._updateVersionNotification = this._updateVersionNotification.bind( this )
        this.capitalizeFirstLetter = this.capitalizeFirstLetter.bind( this )

    }
    toggle ()
    {
        this.setState( {
            tooltipOpen: !this.state.tooltipOpen
        } );
    }

    _updateVersionNotification ()
    {
        updateVersionNotification( true )
        hidePanel( 'updateStatus' )
    }


    capitalizeFirstLetter = function ( str: string ): string
    {
        return str.charAt( 0 ).toUpperCase() + str.toLowerCase().slice( 1 );
    };

    componentDidUpdate ( prevProps: Props, prevState: State )
    {

        if ( this.props.updateStatus.result !== prevProps.updateStatus.result )
        {
            let color = ''
            let _result = this.capitalizeFirstLetter( this.props.updateStatus.result.split( '_' )[ 2 ] )
            let _tooltipText = `You are running ${ this.props.updateStatus.local.version }.  ${ this.props.updateStatus.remote.version } is the latest available on Github.  Click to dismiss until the next version is released on Github.`
            if ( this.props.updateStatus.result === 'equal' )
            {
                color = 'success'

            }
            else if ( this.props.updateStatus.result === 'local_is_newer' )
            {
                color = 'danger'
            }
            else if ( this.props.updateStatus.result === 'local_is_older' )
            {
                color = 'warning'
            }
            else
            {
                color = 'secondary'
            }
            this.setState( {
                gitStateColor: color,
                tooltipText: _tooltipText,
                result: _result
            } )
        }
    }

    render ()
    {

        return (
            <div style={{ fontSize: '12px' }} >
                <Navbar color="light" light sticky="top">
                    nodejs-PoolController

                    <br />
                    <NavLink href='https://github.com/tagyoureit/nodejs-poolController'>Github Repository
                    </NavLink>
                    <Nav className="ml-auto" navbar>


                        <div className="clearfix" style={{ padding: '.5rem' }}>


                            <NavItem className='float-left mr-3'>
                                <NavLink onClick={resetPanels}>Reset Panel Visibility</NavLink>
                            </NavItem>


                            {this.props.updateStatusVisibility==='visible' &&
                                <Button className='btn float-right' color={this.state.gitStateColor} size='sm' onClick={this._updateVersionNotification} id="TooltipStatus" >
                                    {this.state.result}
                                    <Tooltip placement="top" isOpen={this.state.tooltipOpen} target="TooltipStatus" toggle={this.toggle}>
                                        {this.state.tooltipText}
                                    </Tooltip>
                                </Button>
                            }
                        </div>
                    </Nav>


                </Navbar>
            </div>
        )

    }
}
export default Footer;