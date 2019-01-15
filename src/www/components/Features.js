import {
    Row, Col, Table, Card, CardImg, CardText, CardBody,
    CardTitle, CardSubtitle, Button
} from 'reactstrap';
import CustomCard from '../components/CustomCard'


class Features extends React.Component {

    constructor(props) {
        super(props)


    }

    feature(data){
        let res = [];
        for (var cir in  data){
            if (data[cir].hasOwnProperty('name')){
                //console.log(`cir: ${cir} = ${data[cir].friendlyName}`)
                res.push(
                    <Row className=' border-bottom align-items-center'>
                        <Col className='mb-1 mt-1'>{data[cir].name}
                       
                        </Col>
                        <Col className='mb-1 mt-1'>
                        <Button color={data[cir].status===1?'success':'primary'}>{data[cir].status===1?'On':'Off'}</Button>
                        </Col>
                    </Row>
                    
                    )
            }
        }
       
        return res
    }

    render() {
        return (
            <div>
              
                <CustomCard name='Lighting / Features'>
                {this.feature(this.props.data)}
                
                </CustomCard>
            </div>
        );
    }
}

export default Features;