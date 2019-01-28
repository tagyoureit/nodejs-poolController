import {
    Row, Col, Modal, ModalHeader, ModalBody, ModalFooter, Button
} from 'reactstrap';
import CustomCard from './CustomCard'
import Slider from 'react-rangeslider'
import 'react-rangeslider/lib/index.css'
import CustomSlider from '../components/ChlorinatorCustomSlider'


class Chlorinator extends React.Component {

    constructor(props) {
        super(props)
        this.state = {
            modal: false

        };

        if (this.state.outputPoolPercent !== this.props.data.outputPoolPercent) {
            this.setState({ outputPoolPercent: this.props.data.outputPoolPercent })
        }
        if (this.state.outputSpaPercent !== this.props.data.outputSpaPercent) {
            this.setState({ outputSpaPercent: this.props.data.outputSpaPercent })
        }

        this.toggle = this.toggle.bind(this)
    }

    onChange(){

    }

    toggle() {
        // open and close the modal
        this.setState({
            modal: !this.state.modal
        });
    }

    changeOutputPoolPercentVal = (outputPoolPercent) => {
        if (this.state.outputPoolPercent !== outputPoolPercent) {

            //console.log(`setPoint change! ${setPoint}`)
            this.setState({
                outputPoolPercent: outputPoolPercent
            });
        }
    };

    changeOutputPoolPercentComplete = () => {
        console.log(`changing pool ${this.state.outputPoolPercent} for ${this.props.data.name}`)

        setHeatSetPoint(this.props.data.name, this.state.setPoint)
    }

    render() {
        const closeBtn = <button className="close" onClick={this.cancel}>&times;</button>;

        if (this.props.data.hasOwnProperty('name')) {

            return (

                <div>
                    <CustomCard name='Chlorinator'>

                        <Row>
                            <Col xs="6">{this.props.data.name}</Col>
                            <Col>
                                <Button onClick={this.toggle} color={this.props.data.state ? 'success' : 'primary'}>{this.props.data.state ? (this.props.data.superChlorinate ? `SuperChlorinate (${this.props.data.superChlorinateHours})` : 'On') : 'Off'}</Button>
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
                            <Col xs="6">{this.props.data.outputSpaPercent === '-1' ? 'Pool Setpoint' : 'Pool/Spa Setpoint'}
                            </Col>
                            <Col xs="6">{this.props.data.outputSpaPercent === '-1' ? `${this.props.data.outputPoolPercent}%` : `${this.props.data.outputPoolPercent}% / ${this.props.data.outputSpaPercent}%`}
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
                          
                               <CustomSlider data={this.props.data} />
                           

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