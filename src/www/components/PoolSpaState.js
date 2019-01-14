import {
    Row, Col, Table, Card, CardImg, CardText, CardBody,
    CardTitle, CardSubtitle, Button
} from 'reactstrap';

import Link from 'next/link'
import DateTime from './DateTime'

class PoolSpaState extends React.Component {

    constructor(props) {
        super(props)

        this.handleToggleState = this.handleToggleState.bind(this)
      
    }

    handleToggleState(){
        console.log(`toggle ${this.state.data.name} val`)
    }

    render() {

    
        return (

            <div>
                <Card>
                    <CardBody>
                        <CardTitle className='title' style={{ backgroundColor: 'white' }}>
                        {this.props.data.name}
                        <Button size="sm" className="mr-3" color="primary" style={{ float: 'right' }}>Button</Button>

                        </CardTitle>

                        <CardText>

                   
                            <Row>
                                <Col xs="6">Pool State
                                </Col>
                                <Col xs="6">
                                    {this.props.data.state}
                                </Col>
                            </Row>
                         
                    
                            <Row>
                                <Col xs="6">Temp</Col>
                                <Col xs="6">{this.props.data.temp} </Col>
                            </Row>
                            <Row>
                                <Col xs="6">Set Point</Col>
                                <Col xs="6"> {this.props.data.setPoint} </Col>
                            </Row>
                            <Row>
                                <Col xs="6">Heater Mode</Col>
                                <Col xs="6"> {this.props.data.heatMode} {this.props.data.heatModeStr} </Col>
                            </Row>
                           
                        </CardText>

                    </CardBody>
                </Card>





            </div>



        );
    }
}

export default PoolSpaState;