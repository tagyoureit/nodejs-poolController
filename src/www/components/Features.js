import {
    ListGroup, ListGroupItem, Button
} from 'reactstrap';
import CustomCard from '../components/CustomCard'
import {toggleCircuit} from '../components/Socket_Client'



class Features extends React.Component {

    constructor(props) {
        super(props)
    
    }

    feature = (data) => {
        let res = [];
        for (var cir in  data){
            if (data[cir].hasOwnProperty('name')){
                //console.log(`cir: ${cir} = ${data[cir].friendlyName}`)
                res.push(
                    <ListGroup flush key={data[cir].number.toString()}>
                        <ListGroupItem >
                        <div className='d-flex justify-content-between'>

                        {data[cir].name}
                       
                        <Button color={data[cir].status===1?'success':'primary'} key={data[cir].number} onClick={this.handleClick(data[cir].number)}>{data[cir].status===1?'On':'Off'}
                        
                        </Button>
                        
                        </div>
                        </ListGroupItem>
                    </ListGroup>
                    
                    )
            }
        }
       
        return res
    }

    handleClick = id => event => {
        //console.log(`toggle circuit ${id} and event val: ${event.target.value}`)
        toggleCircuit(id)
    }

    render() {
        return (
            <div>
              <a name="Features" className="anchor"></a>
                <CustomCard name='Lighting / Features'>
                {this.feature(this.props.data)}
                
                </CustomCard>
            </div>
        );
    }
}

export default Features;