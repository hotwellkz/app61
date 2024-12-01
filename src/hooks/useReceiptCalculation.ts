import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc, QueryConstraint } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ReceiptData } from '../types/receipt';

export const useReceiptCalculation = (clientId: string) => {
  const [data, setData] = useState<ReceiptData>({
    operationalExpense: 1300000,
    sipWalls: 0,
    ceilingInsulation: 0,
    generalExpense: 0,
    contractPrice: 0,
    totalExpense: 0,
    netProfit: 0
  });

  // Подписка на транзакции проекта
  useEffect(() => {
    const fetchProjectCategory = async () => {
      let unsubscribeTransactions: (() => void) | undefined;

      try {
        // Получаем данные клиента напрямую
        const clientDoc = await getDoc(doc(db, 'clients', clientId));
        
        if (clientDoc.exists()) {
          const clientData = clientDoc.data();
          const projectName = `${clientData.lastName} ${clientData.firstName}`;
          
          // Запрос для поиска категории проекта
          const constraints: QueryConstraint[] = [
            where('title', '==', projectName),
            where('row', '==', 3)
          ];
          
          const categoryQuery = query(
            collection(db, 'categories'),
            ...constraints
          );

          return onSnapshot(categoryQuery, async (categorySnapshot) => {
            if (!categorySnapshot.empty) {
              const categoryId = categorySnapshot.docs[0].id;
              
              // Отписываемся от предыдущей подписки на транзакции, если она есть
              if (unsubscribeTransactions) {
                unsubscribeTransactions();
              }

              // Создаем подписку на транзакции независимо от видимости иконки
              const transactionsQuery = query(
                collection(db, 'transactions'),
                where('categoryId', '==', categoryId),
                where('type', '==', 'expense')
              );

              unsubscribeTransactions = onSnapshot(transactionsQuery, (transactionsSnapshot) => {
                const totalAmount = transactionsSnapshot.docs.reduce((sum, doc) => {
                  const transaction = doc.data();
                  return sum + Math.abs(transaction.amount);
                }, 0);

                setData(prev => {
                  const totalExpense = prev.operationalExpense + prev.sipWalls + 
                    prev.ceilingInsulation + totalAmount;
                  
                  return {
                    ...prev,
                    generalExpense: totalAmount,
                    totalExpense: totalExpense,
                    netProfit: prev.contractPrice - totalExpense
                  };
                });
              });
            }
          });
        }
      } catch (error) {
        console.error('Error fetching project category:', error);
      }
      
      return () => {
        if (unsubscribeTransactions) {
          unsubscribeTransactions();
        }
      };
    };

    fetchProjectCategory();
  }, [clientId]);

  // Подписка на сметы
  useEffect(() => {
    const sipWallsUnsubscribe = onSnapshot(
      doc(db, 'sipWallsEstimates', clientId),
      (doc) => {
        if (doc.exists()) {
          const sipData = doc.data();
          const sip28Total = sipData.items.find((item: any) => 
            item.name === 'СИП панели 163 мм высота 2,8м нарощенные пр-ва HotWell.kz'
          )?.total || 0;
          const sip25Total = sipData.items.find((item: any) => 
            item.name === 'СИП панели 163 мм высота 2,5м пр-ва HotWell.kz'
          )?.total || 0;
          
          setData(prev => ({
            ...prev,
            sipWalls: sip28Total + sip25Total
          }));
        }
      }
    );

    const roofUnsubscribe = onSnapshot(
      doc(db, 'roofEstimates', clientId),
      (doc) => {
        if (doc.exists()) {
          const roofData = doc.data();
          const polystyreneTotal = roofData.items.find((item: any) =>
            item.name === 'Пенополистирол Толщ 150мм (Для Утепления пот. 2-го эт)'
          )?.total || 0;
          
          setData(prev => ({
            ...prev,
            ceilingInsulation: polystyreneTotal
          }));
        }
      }
    );

    const estimateUnsubscribe = onSnapshot(
      doc(db, 'estimates', clientId),
      (doc) => {
        if (doc.exists()) {
          const estimateData = doc.data();
          const contractPrice = estimateData.roofValues?.contractPrice?.value || 0;
          
          setData(prev => {
            const totalExpense = prev.operationalExpense + prev.sipWalls + 
              prev.ceilingInsulation + prev.generalExpense;
            
            return {
              ...prev,
              contractPrice,
              totalExpense,
              netProfit: contractPrice - totalExpense
            };
          });
        }
      }
    );

    return () => {
      sipWallsUnsubscribe();
      roofUnsubscribe();
      estimateUnsubscribe();
    };
  }, [clientId]);

  return data;
};