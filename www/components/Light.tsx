import
{
    Row, Col, Button, ButtonGroup, ButtonDropdown, DropdownToggle, DropdownMenu, DropdownItem
} from 'reactstrap';

import CustomCard from './CustomCard'
import * as React from 'react';
import { setLightMode } from './Socket_Client';

interface Props
{
    // data: ScheduleModule.ScheduleObj
    id: string;
    visibility: string;
}

interface State
{
    dropdownOpen: boolean
}

class Light extends React.Component<Props, State> {

    constructor( props: Props )
    {
        super( props )
        this.state = {
            dropdownOpen: false
        };
        this.toggle = this.toggle.bind( this );
        this.handleClick = this.handleClick.bind( this );
    }

    toggle ()
    {
        this.setState( {
            dropdownOpen: !this.state.dropdownOpen
        } );
    }

    handleClick ( event: any )
    {
        setLightMode(event.target.value)
    }

    render ()
    {
        return (
            <div className="tab-pane active" id="light" role="tabpanel" aria-labelledby="light-tab">
                <CustomCard name='Lights' id={this.props.id} visibility={this.props.visibility}>


                    <ButtonDropdown isOpen={this.state.dropdownOpen} toggle={this.toggle}>
                        <DropdownToggle caret>
                            Intellibrite Mode
                    </DropdownToggle>
                        <DropdownMenu>
                            <DropdownItem header>Actions</DropdownItem>

                            <DropdownItem onClick={this.handleClick} value='0'>Off</DropdownItem>
                            <DropdownItem onClick={this.handleClick} value='1'>On</DropdownItem>
                            <DropdownItem onClick={this.handleClick} value='128'>Color Sync</DropdownItem>
                            <DropdownItem onClick={this.handleClick} value='144'>Color Swim</DropdownItem>
                            <DropdownItem onClick={this.handleClick} value='160'>Color Set</DropdownItem>
                            <DropdownItem onClick={this.handleClick} value='190'>Save</DropdownItem>
                            <DropdownItem onClick={this.handleClick} value='191'>Recall</DropdownItem>

                            <DropdownItem divider />
                            <DropdownItem header>Colors</DropdownItem>
                            <DropdownItem onClick={this.handleClick} value='196' style={{ color: 'white', background: 'gray' }}>White</DropdownItem>
                            <DropdownItem onClick={this.handleClick} value='194'style={{ color: 'green' }}>
                                Green
                                </DropdownItem>
                            <DropdownItem onClick={this.handleClick} value='193'style={{ color: 'blue' }}>
                                Blue
                                </DropdownItem>
                            <DropdownItem onClick={this.handleClick} value='195' style={{ color: 'red' }}>Red
                                </DropdownItem>
                            <DropdownItem onClick={this.handleClick} value='197' style={{ color: 'magenta' }}>Magenta
                                </DropdownItem>

                            <DropdownItem divider />
                            <DropdownItem header>Scenes</DropdownItem>
                            <DropdownItem onClick={this.handleClick} value='177'>Party</DropdownItem>
                            <DropdownItem onClick={this.handleClick} value='178'>Romance</DropdownItem>
                            <DropdownItem onClick={this.handleClick} value='179'>Caribbean</DropdownItem>
                            <DropdownItem onClick={this.handleClick} value='180'>American</DropdownItem>
                            <DropdownItem onClick={this.handleClick} value='181'>Sunset</DropdownItem>
                            <DropdownItem onClick={this.handleClick} value='182'>Royal</DropdownItem>

                        </DropdownMenu>
                    </ButtonDropdown>

                </CustomCard>
            </div>
        );
    }
}

export default Light;