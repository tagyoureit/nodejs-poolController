import {
    Row, Col, Table, Card, CardImg, CardText, CardBody,
    CardTitle, CardSubtitle, Button
} from 'reactstrap';

import Link from 'next/link'
import DateTime from './DateTime'
import CustomCard from './CustomCard'

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
                
                        <CustomCard name={this.props.data.name}>
                        
                        

                   
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
                                <Col xs="6"> {this.props.data.heatModeStr} ({this.props.data.heatMode})</Col>
                            </Row>
                           
                      

                        
                        
                        </CustomCard>
                    
                





            </div>



        );
    }
}

export default PoolSpaState;