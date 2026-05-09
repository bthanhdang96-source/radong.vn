import { type NongSanItem } from '../data/nongSanData';
import { formatSignedVnPrice, formatVnPrice } from '../utils/vnPriceFormat';
import './DetailModal.css';

interface DetailModalProps {
  item: NongSanItem;
  onClose: () => void;
}

export default function DetailModal({ item, onClose }: DetailModalProps) {
  const isUp = item.thayDoi >= 0;
  const sign = isUp ? '+' : '';

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Đóng cửa sổ">
          &times;
        </button>

        <header className="modal-header">
          <div className="modal-header__icon">{item.icon}</div>
          <div className="modal-header__title">
            <h2>{item.ten}</h2>
          </div>
          <span className="modal-badge">{item.category}</span>
        </header>

        <div className="modal-grid">
          <div className="modal-price-card">
            <h3>Giá hiện tại</h3>
            <div className="modal-price__value">
              {formatVnPrice(item.giaCurrent)}
              <span className="modal-price__unit">{item.donVi}</span>
            </div>
            <div className={`modal-price__change ${isUp ? 'modal-price__change--up' : 'modal-price__change--down'}`}>
              {formatSignedVnPrice(item.thayDoi)} ({sign}{item.thayDoiPct.toFixed(2)}%)
            </div>
          </div>

          <div className="modal-info-card">
            <h3>Khuyến nghị chuyên gia</h3>
            <div className={`modal-recommend modal-recommend--${item.khuyenNghi === 'Mua' ? 'buy' : item.khuyenNghi === 'Bán' ? 'sell' : 'hold'}`}>
              {item.khuyenNghi}
            </div>
            <p className="modal-info-text">
              Dựa trên phân tích xu hướng kỹ thuật và nguồn cung nội địa trong 7 ngày qua.
            </p>
          </div>
        </div>

        <div className="modal-history">
          <h3>Lịch sử giá gần đây</h3>
          <table className="modal-table">
            <tbody>
              <tr>
                <td>Hôm qua</td>
                <td className="modal-table__num">{formatVnPrice(item.giaHom_qua)}</td>
              </tr>
              <tr>
                <td>Tuần trước</td>
                <td className="modal-table__num">{formatVnPrice(item.giaTuanTruoc)}</td>
              </tr>
              <tr>
                <td>Tháng trước</td>
                <td className="modal-table__num">{formatVnPrice(item.giaThangtruoc)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="modal-range">
          <div className="modal-range__label">
            <span>Đáy 52 tuần</span>
            <span>Đỉnh 52 tuần</span>
          </div>
          <div className="modal-range__track">
            <div
              className="modal-range__fill"
              style={{
                left: '0%',
                width: `${Math.min(100, Math.max(0, ((item.giaCurrent - item.low52w) / (item.high52w - item.low52w)) * 100))}%`,
              }}
            />
          </div>
          <div className="modal-range__values">
            <span>{formatVnPrice(item.low52w)}</span>
            <span>{formatVnPrice(item.high52w)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
