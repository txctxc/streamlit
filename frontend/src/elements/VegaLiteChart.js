import React, { Component } from 'react';
import { Alert }  from 'reactstrap';
import { tableGetRowsAndCols, indexGet, tableGet } from '../dataFrameProto';

import VegaLite from 'react-vega-lite';

import './VegaLiteChart.css';


const MagicFields = {
  DATAFRAME_INDEX: '__index__',
  COLUMN_TYPE: '__column_type__',
};


/** Types of dataframe-indices that are supported as x axes. */
const SUPPORTED_INDEX_TYPES = new Set([
  'datetimeIndex',
  'float_64Index',
  'int_64Index',
  'rangeIndex',
  'timedeltaIndex',
  'uint_64Index',
]);


class VegaLiteChart extends Component {
  constructor(props) {
    super(props);

    /** This will be initialized with VegaLite's View object. */
    this.vegaView = null;
  }

  render() {
    try {
      const chart = this.props.chart;

      const spec = JSON.parse(chart.get('spec'));
      maybeAddAutosizing(spec);

      const dataProto = chart.get('data');
      let dataObj;

      if (dataProto && dataProto.get('data')) {
        const dataArr = getDataArray(dataProto);
        dataObj = {values: dataArr};
      }

      const height = spec.height == null ? 200 : spec.height;
      const width = spec.width == null ? this.props.width : spec.width;

      return (
        <VegaLite
            spec={spec}
            data={dataObj}
            renderer="canvas"
            width={width}
            height={height}
            onNewView={view => this.vegaView = view}
            />
      );

    } catch (e) {
      return (
        <Alert color="danger">
          <strong>{e.name}</strong>: {e.message}
        </Alert>
      );
    }
  }

  /**
   * Detect whether rows were appended to dataframe and, if so, pretend this
   * component did not update and instead use VegaLite's own .insert() method,
   * which is faster.
   */
  shouldComponentUpdate(newProps, newState) {
    const data0 = this.props.chart.get('data');
    const data1 = newProps.chart.get('data');

    const [numRows0, numCols0] = tableGetRowsAndCols(data0.get('data'));
    const [numRows1, numCols1] = tableGetRowsAndCols(data1.get('data'));

    const spec0 = this.props.chart.get('spec');
    const spec1 = newProps.chart.get('spec');

    const dataChanged = data0 !== data1;
    const specChanged = spec0 !== spec1;
    const widthChanged = this.props.width !== newProps.width;

    // If spec or width changed, doesn't matter whether data changed. Redraw
    // whole chart.
    if (specChanged || widthChanged) {
      return true;
    } 

    // Just a small optimization: if spec, width, and data are all the same,
    // we know there's no need to redraw anything and can quit here.
    if (!dataChanged) {
      return false;
    }

    // Check if dataframes have same "shape" but the new one has more rows.
    if (numCols0 === numCols1 && numRows0 <= numRows1 &&
        // Check if the new dataframe looks like it's a superset of the old one.
        // (this is a very light check, and not guaranteed to be right!)
        data0[0] === data1[0] && data0[numRows0 - 1] === data1[numRows0 - 1]) {

      if (numRows0 < numRows1) {
        console.log('data1: ', data1);
        this.addRows(data1, numRows0);
        // Since we're handling the redraw using VegaLite's addRows(), tell
        // React not to redraw the chart.
        return false;
      }
    }

    // Data changed and we did not use addRows() for it, so tell React to redraw
    // the chart.
    return true;
  }

  /**
   * Uses VegaLite's insert() method to add more data to the chart.
   * See https://vega.github.io/vega/docs/api/view/
   */
  addRows(data, startIndex) {
    if (!this.vegaView) throw new Error('Chart has not been drawn yet');
    const rows = getDataArray(data, startIndex);
    console.log(rows);
    // TODO: Support adding rows to datasets with different names.
    // "data_0" is what Vega calls the 0th unnamed dataset.
    this.vegaView.insert('data_0', rows);
    this.vegaView.run();
  }

  toCanvas(scaleFactor) {
    if (!this.vegaView) throw new Error('Chart has not been drawn yet');
    return this.vegaView.toCanvas(scaleFactor);
  }

  toSVG(scaleFactor) {
    if (!this.vegaView) throw new Error('Chart has not been drawn yet');
    return this.vegaView.toSVG(scaleFactor);
  }

  toImageUrl(type, scaleFactor) {
    if (!this.vegaView) throw new Error('Chart has not been drawn yet');
    return this.vegaView.toImageUrl(type, scaleFactor);
  }
}


function getDataArray(dataProto, startIndex=0) {
  const dataArr = [];
  const [rows, cols] = tableGetRowsAndCols(dataProto.get('data'));

  const indexType = dataProto.get('index').get('type');
  const hasSupportedIndex = SUPPORTED_INDEX_TYPES.has(indexType);

  for (let rowIndex = startIndex; rowIndex < rows; rowIndex++) {
    let row = {};

    if (hasSupportedIndex) {
      row[MagicFields.DATAFRAME_INDEX] =
          indexGet(dataProto.get('index'), 0, rowIndex);
    }

    for (let colIndex = 0 ; colIndex < cols ; colIndex++) {
      row[indexGet(dataProto.get('columns'), 0, colIndex)] =
          tableGet(dataProto.get('data'), colIndex, rowIndex);
    }

    dataArr.push(row)
  }

  return dataArr;
}


function maybeAddAutosizing(spec) {
  if (spec.autosize) return;
  spec.autosize = {
    type: 'fit',
    contains: 'padding',
    resize: true,
  };
}


export default VegaLiteChart;