import
{
    ListGroup, ListGroupItem, Button
} from 'reactstrap';
import CustomCard from './CustomCard'
import { toggleCircuit } from './Socket_Client'
import * as React from 'react';

interface Props
{
    feature: Circuit.ICurrentCircuitsArr;
    hideAux: boolean,
    id: string;
    visibility: string;
}


class Feature extends React.Component<Props, any> {

    constructor( props: Props )
    {
        super( props )

        this.handleClick = this.handleClick.bind( this );
    }

    feature = ( data: Circuit.ICurrentCircuitsArr ) =>
    {
        let res = [];
        if ( data === undefined )
        {
            return ( <></> )
        }
        else
        {
            // TODO: Aux Extra and NOT used should be hidden.
            for ( var cir in data )
            {
                // check to make sure we have the right data
                if ( data[ cir ].hasOwnProperty( 'name' ) )
                {
                    // if hideAux is true skip the unused circuits
                    if ( [ 'NOT USED', 'AUX EXTRA' ].indexOf( data[ cir ].name ) !== -1 && this.props.hideAux )
                    {
                    }
                    else
                    {
                        res.push(
                            <ListGroup flush key={data[ cir ].number.toString()}>
                                <ListGroupItem >
                                    <div className='d-flex justify-content-between'>

                                        {data[ cir ].friendlyName}

                                        <Button color={data[ cir ].status === 1 ? 'success' : 'primary'} key={data[ cir ].number} onClick={this.handleClick} value={data[ cir ].number} >{data[ cir ].status === 1 ? 'On' : 'Off'}

                                        </Button>

                                    </div>
                                </ListGroupItem>
                            </ListGroup>

                        )

                    }
                }

            }
            return res
        }
    }

    handleClick = ( event: any ): any =>
    {
        toggleCircuit( event.target.value )
    }

    render ()
    {
        return (
            <div className="feature-pane active" id="feature" role="tabpanel" aria-labelledby="feature-tab">
                <CustomCard name='Lighting / Features' id={this.props.id} visibility={this.props.visibility}>
                    {this.feature( this.props.feature )}

                </CustomCard>
            </div>
        );
    }
}

export default Feature;