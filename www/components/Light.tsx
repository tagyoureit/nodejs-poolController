import
{
    Row, Col, Button, ButtonGroup, ButtonDropdown, DropdownToggle, DropdownMenu, DropdownItem, Modal, ModalHeader, ModalBody, ModalFooter
} from 'reactstrap';

import CustomCard from './CustomCard'
import * as React from 'react';
import { setLightMode } from './Socket_Client';
import EggTimerEdit from './LightEdit'


interface Props
{
    data: Circuit.ICurrentCircuitsArr
    id: string;
    visibility: string;
}

interface State
{
    dropdownOpen: boolean
    modalOpen: boolean
}

class Light extends React.Component<Props, State> {

    constructor( props: Props )
    {
        super( props )
        this.state = {
            dropdownOpen: false,
            modalOpen: false
        };
        this.toggleDropDown = this.toggleDropDown.bind( this );
        this.toggleModal = this.toggleModal.bind( this )
        this.handleClick = this.handleClick.bind( this );
    }

    toggleModal() {
        // open and close the modal
        this.setState({
            modalOpen: !this.state.modalOpen
        });
    }
    toggleDropDown ()
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
        const closeBtn = <button className="close" onClick={this.toggleModal}>&times;</button>;

        return (
            <div className="tab-pane active" id="light" role="tabpanel" aria-labelledby="light-tab">
                <CustomCard name='Lights' id={this.props.id} visibility={this.props.visibility} edit={this.toggleModal}>


                    <ButtonDropdown isOpen={this.state.dropdownOpen} toggle={this.toggleDropDown}>
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
                <Modal isOpen={this.state.modalOpen} toggle={this.toggleModal} size='xl' >
                        <ModalHeader toggle={this.toggleModal} close={closeBtn}>Adjust Intellibrite Lights</ModalHeader>
                        <ModalBody>
                               <EggTimerEdit data={this.props.data} />
                        </ModalBody>
                        <ModalFooter>
                            <Button  onClick={this.toggleModal}>Close</Button>
                        </ModalFooter>
                    </Modal>
            </div>
        );
    }
}

export default Light;