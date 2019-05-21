import {
    Row, Col, Modal, ModalHeader, ModalBody, ModalFooter, Button
} from 'reactstrap';
import CustomCard from './CustomCard'
import Slider from 'react-rangeslider'
import 'react-rangeslider/lib/index.css'
import ChlorinatorCustomSlider from '../components/ChlorinatorCustomSlider'
import * as React from 'react';
import {setHeatSetPoint} from './Socket_Client'

interface Props
{
    data: Chlorinator.IBaseChlorinator;
    id: string;
    visibility: string;
}
interface State
{
    modal: boolean
}

class Chlorinator extends React.Component<Props, State> {

    constructor(props:Props) {
        super(props)
        this.state = {
            modal: false
        };
        this.toggle = this.toggle.bind( this )

    }

    onChange(){

    }

    toggle() {
        // open and close the modal
        this.setState({
            modal: !this.state.modal
        });
    }

    render ()
    {
        const closeBtn = <button className="close" onClick={this.toggle}>&times;</button>;
        let chlorStatus = 'Off'
        if ( this.props.data.currentOutput >= 100 )
        {
            chlorStatus = `Super Chlorinate (${this.props.data.superChlorinateHours} hours)`
        } else if( this.props.data.currentOutput>0 ){
           chlorStatus =  'On'
        }  
        else
        {
            chlorStatus = 'Off'
        }

        if (this.props.data.hasOwnProperty('name')) {
            return (
                <div className="tab-pane active" id="chlorinator" role="tabpanel" aria-labelledby="chlorinator-tab">
                    <CustomCard name='Chlorinator' id={this.props.id} visibility={this.props.visibility} edit={this.toggle}>

                        <Row>
                            <Col xs="6">{this.props.data.name}</Col>
                            <Col>
                                <Button onClick={this.toggle} color={this.props.data.currentOutput>0 ? 'success' : 'primary'}>{chlorStatus}</Button>
                            </Col>
                        </Row>

                        <Row>
                            <Col xs="6">Salt</Col>
                            <Col xs="6">{this.props.data.saltPPM} ppm</Col>
                        </Row>
                        <Row>
                            <Col xs="6">Current Output</Col>
                            <Col xs="6">{this.props.data.currentOutput} %</Col>
                        </Row>
                        <Row>
                            <Col xs="6">{this.props.data.outputSpaPercent === -1 ? 'Pool Setpoint' : 'Pool/Spa Setpoint'}
                            </Col>
                            <Col xs="6">{this.props.data.outputSpaPercent === -1 ? `${this.props.data.outputPoolPercent}%` : `${this.props.data.outputPoolPercent}% / ${this.props.data.outputSpaPercent}%`}
                            </Col>
                        </Row>
                        <Row>
                            <Col xs="6">Status</Col>
                            <Col xs="6">{this.props.data.status}</Col>
                        </Row>

                    </CustomCard>
                    <Modal isOpen={this.state.modal} toggle={this.toggle} size='xl' >
                        <ModalHeader toggle={this.toggle} close={closeBtn}>Adjust Chlorinator Levels</ModalHeader>
                        <ModalBody>
                          
                               <ChlorinatorCustomSlider {...this.props.data} />
                           

                        </ModalBody>
                        <ModalFooter>

                            <Button  onClick={this.toggle}>Close</Button>

                        </ModalFooter>
                    </Modal>
                    </div>
                
            );
        }
        else {
            return (<div>No Chlor Info Yet</div>)
        }

    }

}

export default Chlorinator;