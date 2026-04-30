import TickerBar from '../components/TickerBar';
import SummaryCards from '../components/SummaryCards';
import TopMovers from '../components/TopMovers';
import PriceTable from '../components/PriceTable';

export default function HomeDashboard() {
  return (
    <>
      <TickerBar />
      <SummaryCards />
      <TopMovers />
      <PriceTable />
    </>
  );
}
